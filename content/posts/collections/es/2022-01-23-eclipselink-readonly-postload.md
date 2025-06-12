---
title: JPA @PostLoad durante consultas readOnly (EclipseLink)
url: jpa-postload-readonly-eclipselink
id: 78
category:
- jpa: JPA
  # "JPA" se mantiene como término estándar
tags:
  - sql
  - eclipselink
author: Damian Terlecki
date: 2022-01-23T20:00:00
---
Según la especificación JPA 2.1, los métodos de entidad anotados con `@PostLoad` se usan como callbacks cuando la entidad se carga desde la base de datos. Más precisamente, ocurre cuando la entidad se carga en el contexto de persistencia y cuando se invoca el refresh. Sin embargo, existe la creencia errónea de que el método se llamará siempre que obtengamos datos de la base de datos.

Tanto la anotación `@ReadOnly` en la entidad como el hint `QueryHints.READ_ONLY` ("eclipselink.read-only"), específico de EclipseLink, nos permiten saltarnos el contexto de persistencia durante el procesamiento de la consulta. Es una opción interesante de optimización que reduce el consumo de memoria heap al cargar grandes volúmenes de datos. Al mismo tiempo, permite utilizar la caché compartida a nivel de unidad de persistencia. Muy útil cuando no necesitamos modificar la entidad.

Sin embargo, cuando se usa esta funcionalidad, el método `@PostLoad` no se invoca. Para ilustrar un ejemplo, usaré una entidad sencilla con dicho método:

```java
package dev.termian.demo;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.eclipse.persistence.annotations.Customizer;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.PostLoad;
import javax.persistence.Table;
import javax.persistence.Transient;

@Getter
@Setter
@ToString(exclude = "id")
@Entity
@Table(name="users")
@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    @Transient
    private int index = 0;

    @PostLoad
    void postLoad() {
        index++;
    }

}
```

La prueba del valor del campo `index` tras cargar desde la base de datos muestra que el método no se llamó para la consulta *readOnly*:

```java
package dev.termian.demo;

import org.eclipse.persistence.config.HintValues;
import org.eclipse.persistence.config.QueryHints;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.transaction.Transactional;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest
class DemoApplicationTests {

    @PersistenceContext
    EntityManager em;

    @Test
    void testPostLoadReadOnly() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        query.setHint(QueryHints.READ_ONLY, HintValues.TRUE);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    @Test
    void testPostLoad() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    private void assertPostLoadExecutedOnce(List<User> users) {
        assertFalse(users.isEmpty());
        for (User user : users) {
            assertEquals(1, user.getIndex());
        }
    }

}
```

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="Método @PostLoad no invocado en consulta readOnly" title="Método @PostLoad no invocado en consulta readOnly">

Por la falta de este comportamiento en EL, encontramos bugs abiertos [336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066) y [477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063). En uno de los reportes, Jan Vermeulen [explica](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0) cómo se traduce el problema en el código de EclipseLink. En resumen, el método `@PostLoad` se asocia a los eventos **clone** y **refresh** de EclipseLink, que ocurren justo cuando una entidad se carga en el contexto. Sin embargo, no está vinculado al evento **build**, que normalmente ocurre fuera de la unidad de trabajo y podría solucionar el problema.

Si queremos extender el método `@PostLoad` más allá del contexto de persistencia, tendremos que llegar al código que vincula los métodos de ciclo de vida de la entidad a los eventos de EclipseLink. La operación relevante ocurre en la clase `EntityListener` durante la inicialización de la unidad de persistencia. Al mismo tiempo, EL nos ofrece una API para configurar la capa de persistencia. Usando las siguientes interfaces, podemos hacer lo que necesitamos:
- `SessionCustomizer` definido a nivel de unidad de persistencia;
- `DescriptorCustomizer` definido a nivel de entidad.

## SessionCustomizer

La inicialización de la sesión suele ocurrir justo antes de la creación del primer entity manager (contexto de persistencia). Uno de los últimos pasos durante la inicialización es la configuración. La interfaz nos da solo un método customize con un parámetro session. Desde la sesión, podemos leer los metadatos inicializados en forma de descriptores de entidad (#1) detectados en etapas previas.

```java
package dev.termian.demo;

import org.eclipse.persistence.config.SessionCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {

    @Override
    public void customize(Session session) {
        for (ClassDescriptor classDescriptor : session.getDescriptors().values()) { // #1
            DescriptorEventListener entityEventListener = classDescriptor.getEventManager()
                    .getEntityEventListener();
            if (entityEventListener instanceof EntityListener) { // #2
                setPostLoadToPostBuild((EntityListener<?>) entityEventListener);
            }
        }
    }

    private void setPostLoadToPostBuild(EntityListener<?> listener) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods(); // #3
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE,
                Collections.emptyList()); // #4
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            listener.setPostBuildMethod(postLoad); // #5
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

El *entity listener* (#2) asociado a la clase contiene referencias a los métodos de ciclo de vida de la entidad (#3). Sabiendo que el evento *POST_CLONE* de EclipseLink (#4) está asociado al método `@PostLoad`, podemos asociarlo también al evento *POST_BUILD* (#5).

En la solución anterior, hay [una situación]((https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149)) en la que el método *postLoad* se llamará dos veces (durante *build* y *clone*). Esto puede ocurrir cuando los objetos se clonan en una unidad de trabajo. Con un listener intermedio (#6), puedes cubrir este caso y condicionalmente (#7) delegar el *postBuild* al *postClone* del listener básico (#8):

```java
public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {
    //...
    private void setPostLoadToPostBuild(EntityListener<?> listener, ClassDescriptor classDescriptor) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods();
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE, Collections.emptyList());
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            classDescriptor.getEventManager().addListener(new DescriptorEventAdapter() { // #6
                @Override
                public void postBuild(DescriptorEvent event) {
                    if (!event.getSession().isUnitOfWork()) { // #7
                        listener.postClone(event); // #8
                    }
                }
            });
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

Aplicamos el configurador en el archivo *persistence.xml* (el namespace puede variar entre JPA 2.x y 3.x). Defínelo proporcionando el nombre de paquete de la clase bajo la propiedad `eclipselink.session.customizer`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<persistence version="2.1" xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence 
             http://xmlns.jcp.org/xml/ns/persistence/persistence_2_1.xsd">
    <persistence-unit name="my-pu" transaction-type="RESOURCE_LOCAL">
        <!--...-->
        <properties>
            <!--...-->
            <property name="eclipselink.session.customizer"
                      value="dev.termian.demo.PostLoadOnReadOnlySessionCustomizer"/>
        </properties>
    </persistence-unit>
</persistence>
```

## DescriptorCustomizer

Una extensión similar puede implementarse a nivel de entidad. En el momento de la configuración, el `EntityListener` estándar no estará inicializado en este caso (#9). Sin embargo, nada impide mover las partes necesarias del código (#2, #7, #9) al procesamiento de eventos. De hecho, podríamos refactorizar el ejemplo del punto #8 de la misma manera.

```java
package dev.termian.demo;

import org.eclipse.persistence.config.DescriptorCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlyDescriptorCustomizer extends DescriptorEventAdapter implements DescriptorCustomizer {

    @Override
    public void customize(ClassDescriptor descriptor) {
        assert descriptor.getEventManager().getEntityEventListener() == null; // #9
        descriptor.getEventManager().addListener(this);
    }

    @Override
    public void postBuild(DescriptorEvent event) {
        // ((User)event.getSource()).postLoad();
        if (!event.getSession().isUnitOfWork()) {
            DescriptorEventListener entityEventListener = event.getDescriptor().getEventManager().getEntityEventListener();
            if (entityEventListener instanceof EntityListener) {
                EntityListener<?> entityListener = (EntityListener<?>) entityEventListener;
                entityListener.postClone(event);
            }
        }
    }

}
```

La anotación `org.eclipse.persistence.annotations.Customizer` puede usarse para aplicar el customizer, es decir, `@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)`. Alternativamente, también puedes hacerlo a través del [descriptor de persistencia](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm) o mediante el [descriptor ORM de EclipseLink](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC).

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="Método @PostLoad vinculado al evento POST_BUILD" title="Método @PostLoad vinculado al evento POST_BUILD">

Ten en cuenta que en este ejemplo se usó la interfaz interna de EclipseLink `org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener` (EL 2.7.4). Para eliminar esta dependencia, solo necesitas encontrar tu propia forma de buscar los métodos anotados con `@PostLoad`. Ten en cuenta, además, que estos métodos también pueden encontrarse en clases padre marcadas con la anotación `@MappedSuperclass`.
