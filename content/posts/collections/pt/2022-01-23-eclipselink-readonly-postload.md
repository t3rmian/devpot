---
title: JPA @PostLoad em queries readOnly (EclipseLink)
url: jpa-postload-readonly-eclipselink
id: 78
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
    author: Damian Terlecki
    date: 2022-01-23T20:00:00
---
De acordo com a especificação JPA 2.1, os métodos de entidade anotados com `@PostLoad` são usados como callbacks quando a entidade é carregada do banco de dados. Mais precisamente, isso acontece quando a entidade é carregada no contexto de persistência e quando a atualização (refresh) é invocada. No entanto, existe um equívoco de que o método será chamado sempre que buscarmos dados do banco de dados.

Tanto a anotação `@ReadOnly` na entidade quanto a hint `QueryHints.READ_ONLY` ("eclipselink.read-only"), específica da implementação do EclipseLink, nos permitem contornar o contexto de persistência durante o processamento da query. Esta é uma opção de otimização interessante que reduz o consumo de memória heap ao carregar grandes conjuntos de dados. Ao mesmo tempo, permite-nos utilizar o cache compartilhado no nível da unidade de persistência. Ótimo quando não precisamos modificar a entidade.

No entanto, quando o recurso acima é usado, o método `@PostLoad` não é invocado. Para ilustrar um exemplo de situação, usarei uma entidade simples com tal método:

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

O teste do valor do campo `index` após o carregamento do banco de dados mostra que o método não foi chamado para a query *readOnly*:

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

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="Método @PostLoad não invocado em query readOnly" title="Método @PostLoad não chamado em query readOnly">

Devido à falta do comportamento desejado pelo EL, encontramos relatórios de bugs abertos [336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066) e [477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063). Em um dos relatórios, Jan Vermeulen [explica](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0) como o problema se traduz no código do EclipseLink. Em suma, o método `@PostLoad` está anexado aos eventos **clone** e **refresh** do EclipseLink que ocorrem exatamente quando uma entidade é carregada no contexto. No entanto, ele não está ligado ao evento **build**, que geralmente ocorre fora da unidade de trabalho e poderia potencialmente resolver o problema.

Querendo estender o método `@PostLoad` também para além do contexto de persistência, teremos que chegar ao código que vincula os métodos do ciclo de vida da entidade aos eventos do EclipseLink. A operação relevante ocorre na classe `EntityListener` durante a inicialização da unidade de persistência. Ao mesmo tempo, o EL nos fornece uma API para configurar ainda mais a camada de persistência. Usando as seguintes interfaces, podemos fazer o que queremos:
- `SessionCustomizer` definido no nível da unidade de persistência;
- `DescriptorCustomizer` definido no nível da entidade.

## SessionCustomizer

A iniciação da sessão geralmente ocorre logo antes da criação do primeiro entity manager (contexto de persistência). Um dos últimos passos durante a inicialização é a configuração. A interface nos fornece apenas um método de customização com um parâmetro de sessão. Da sessão, podemos ler os metadados inicializados na forma de descritores de entidade (#1) detectados nas etapas anteriores deste processo.

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

O *entity listener* (#2) associado à classe descoberta anteriormente contém referências aos métodos de ciclo de vida associados da entidade (#3). Sabendo que o evento *POST_CLONE* do EclipseLink (#4) está anexado ao método `@PostLoad`, podemos também anexá-lo ao evento *POST_BUILD* (#5).

Na solução acima, há [uma situação]((https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149)) em que o método *postLoad* será chamado duas vezes (durante *build* e *clone*). Isso pode acontecer quando os objetos são clonados em uma unidade de trabalho (unidade de persistência). Com o listener intermediário (#6), você pode cobrir este caso e condicionalmente (#7) delegar o *postBuild* para o *postClone* do listener básico (#8):

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

Aplicamos o configurador no arquivo *persistence.xml* (o namespace apropriado pode diferir entre as versões JPA *2.x* e *3.x*). Defina isso fornecendo o nome do pacote da classe sob a propriedade `eclipselink.session.customizer`:

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

Uma extensão semelhante pode ser implementada no nível da entidade. No momento da configuração, o `EntityListener` padrão não será inicializado neste caso (#9). No entanto, nada impede que você mova as partes necessárias do código (#2, #7, #9) para o processamento de eventos. Na verdade, poderíamos refatorar o exemplo do ponto #8 da mesma forma.

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

A anotação `org.eclipse.persistence.annotations.Customizer` pode ser usada para aplicar o customizador, por exemplo, `@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)`. Alternativamente, você também pode fazê-lo através do [descritor de persistência](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm) ou através do [descritor ORM](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC) do EclipseLink.

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="Método @PostLoad anexado ao evento POST_BUILD" title="Método @PostLoad anexado ao evento POST_BUILD">

Tenha em mente que uma interface interna do EclipseLink `org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener` foi usada neste exemplo (EL 2.7.4). Para remover essa dependência, tudo que você precisa fazer é descobrir sua própria maneira de procurar os métodos anotados com `@PostLoad`. Note, no entanto, que tais métodos também podem ser encontrados nas classes pai marcadas com a anotação `@MappedSuperclass`.
