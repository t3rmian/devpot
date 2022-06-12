---
title: JPA @PostLoad przy zapytaniach readOnly (EclipseLink)
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


Zgodnie ze specyfikacją JPA, metody encji adnotowane przy pomocy `@PostLoad` służą do wywołania kodu w momencie załadowania
encji z bazy danych. Precyzyjniej, następuje to w momencie załadowania encji do *persistence context* oraz w momencie wywołania
operacji *refresh*. Mylnie można jednak zakładać, że metoda zostanie wywołana zawsze gdy zaciągamy dane z bazy danych.

Zarówno adnotacja `@ReadOnly` ustawiana na encji, jak i podpowiedź `QueryHints.READ_ONLY` ("eclipselink.read-only"), specyficzne
dla implementacji EclipseLink pozwalają na pominięcie *persistence contextu* podczas procesowania zapytań. Jest to ciekawa opcja optymalizacyjna pozwalająca
zmniejszyć zużycie pamięci sterty przy ładowaniu większych zbiorów danych. Równocześnie pozwala wykorzystać współdzieloną pamięć podręczną na poziomie
*persistence unit*, gdy nie potrzebujemy modyfikować encji.

W przypadku wykorzystania powyższej funkcjonalności nie dojdzie do wywołania metody `@PostLoad`.
Do zobrazowania przykładowej sytuacji posłużę się prostą encją z taką metodą:
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

Test wartości pola `index` po załadowaniu z bazy danych pokazuje, że metoda nie wywołała się przy zapytaniu *readOnly*:
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

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="Metoda @PostLoad nie wywołana przy zapytaniu readOnly" title="Metoda @PostLoad nie wywołana przy zapytaniu readOnly">

Z powodu braku zaznaczenia docelowego zachowania przez EL, znajdziemy otwarte zgłoszenia błędów [336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066) i
[477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063). W jednym ze zgłoszeń Jan Vermeulen [tłumaczy](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0)
jak problem przekłada się na kod EclipseLinka. W skrócie metoda `@PostLoad` podpinana jest do EclipseLinkowych zdarzeń *clone* i *refresh*
mających miejsce właśnie przy odświeżaniu i ładowaniu do kontekstu. Nie jest natomiast podpinana pod zdarzenie *build*, które występuje
również poza kontekstem i mogłoby być potencjalnym rozwiązaniem problemu.

Chcąc więc rozszerzyć działanie metody `@PostLoad` również poza *persistence context*, będziemy musieli dostać się do kodu wiążącego
metodę ze zdarzeniami EclipseLinkowymi. Szukana operacja odbywa się w klasie `EntityListener` podczas inicjalizacji *persistence unit*.
EL udostępnia nam natomiast dwa interfejsy do konfiguracji działania naszej warstwy persystencji, z poziomu których możemy
podpiąć nasze własne metody. Są to:
- `SessionCustomizer` definiowany na poziomie persistence unit;
- `DescriptorCustomizer` definiowany na poziomie encji.

## SessionCustomizer

Inicjalizacja sesji odbywa się z reguły tuż przed utworzeniem pierwszego kontekstu (*entity managera*). Jednym z ostatnich
jej kroków jest zaaplikowanie konfiguratora. Interfejs udostępnia nam jedynie jedną metodę *customize* z parametrem
sesji, z którego następnie możemy odczytać zainicjalizowane metadane w postaci deskryptorów encji (#1) wykrytych w poprzednich etapach tej fazy.


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

*Entity listener* (#2) powiązany z encją zawiera uprzednio odnalezione i powiązane metody cyklu życia encji (#3).
Wiedząc, że EclipseLinkowe zdarzenie *POST\_CLONE* (#4) podpięte jest pod metodę `@PostLoad`, możemy ją podpiąć również pod
zdarzenie *POST\_BUILD* (#5).


W powyższym rozwiązaniu istnieje [sytuacja](https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149), gdy metoda *postLoad* wywoła się dwa razy (build i clone).
Sytuacja wystąpić może podczas klonowania obiektów (persistence unit) w jednostce pracy. Jeśli chcemy pominąć taki przypadek, to
wystarczy, że zweryfikujemy ten warunek za pomocą pośredniego *listenera* (#6) warunkowo (#7) delegującego *postBuild* do *postClone* podstawowego listenera (#8):

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

Konfigurator podpinamy w pliku *persistence.xml* (właściwa przestrzeń nazw może się różnić w zależności od wersji JPA *2.x* i *3.x*).
Własność `eclipselink.session.customizer` powinna wskazywać na nazwę pakietową klasy:

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

Podobne rozszerzenie zaimplementować możemy na poziomie właściwej encji. W momencie konfiguracji standardowy `EntityListener`
nie będzie w tym przypadku zainicjalizowany (#9). Nic nie stoi jednak na przeszkodzie, żeby przenieść potrzebną część kodu (#2, #7, #9)
do momentu obsługi zdarzenia. Właściwie w ten sam sposób moglibyśmy zrefaktorować przykład w punkcie 8.

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

Konfigurator podpinamy pod encję adnotacją `org.eclipse.persistence.annotations.Customizer`: *@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)*.
Alternatywnie możemy to też zrobić przy pomocy [deskryptora presistence](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm) bądź
EclipseLinkowego [deskryptora orm](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC).

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="Metoda @PostLoad podpięta do zdarzenia POST_BUILD" title="Metoda @PostLoad podpięta do zdarzenia POST_BUILD">

Miejmy na uwadze to, że korzystamy z wewnętrznego interfejsu EclipseLink w postaci `org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener`
(przykład aktualny dla wersji EL 2.7.4).
Jeśli chcielibyśmy uniezależnić się od implementacji, wystarczy, że zaproponujemy własne rozwiązanie wyszukiwania metod adnotowanych `@PostLoad`.
W takim wypadku warto pamiętać o tym, że metoda może znaleźć się również w klasach nadrzędnych adnotowanych `@MappedSuperclass`.