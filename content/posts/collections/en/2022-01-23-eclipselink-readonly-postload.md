---
title: JPA @PostLoad during readOnly (EclipseLink) queries
url: jpa-postload-readonly-eclipselink
id: 78
tags:
  - java
  - database
author: Damian Terlecki
date: 2022-01-23T20:00:00
---
According to the JPA 2.1 specification, entity methods annotated with `@PostLoad` are used as callbacks when the entity is loaded from the database.
More precisely, it happens when the entity is loaded into persistence context and when the refresh is invoked. However,
there is a misconception that the method will be called anytime we fetch data from the database.

Both the `@ReadOnly` annotation set on the entity and the `QueryHints.READ_ONLY` ("eclipselink.read-only") hint, specific
to the EclipseLink implementation, allows us to bypass persistence context during query processing. This is an
interesting optimization option that reduces heap memory consumption when loading larger datasets. At the same time, it
allows us to utilize shared cache on the persistence unit level. Fancy when we do not need to modify the entity.

However, when the above feature is used, the `@PostLoad` method is not invoked. To illustrate an example of a situation, I
will use a simple entity with such method:

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

The test of the `index` field value after loading from the database shows that the method was not called for the *readOnly* query:

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

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="@PostLoad method not invoked on readOnly query" title="@PostLoad method not called on readOnly query">

Due to the lack of target behavior by EL, we find open bug reports [336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066)
and [477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063). In one of the reports, Jan
Vermeulen [explains](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0) how the problem translates into the EclipseLink code.
In short, the `@PostLoad` method is attached to
the EclipseLink **clone** and **refresh** events that occur just when an entity is loaded into the context. However, it is
not hooked up to the **build** event, which usually occurs outside the unit of work and could potentially solve the problem.

Wanting to extend the `@PostLoad` method also beyond tje persistence context, we will have to get to the code that binds
the entity lifecycle methods to the EclipseLink events. The relevant operation occurs in the `EntityListener` class during the persistence unit initialization.
At the same time, EL provides us with an API to further configure the persistence layer. Using the following
interfaces, we can do our bidding:
- `SessionCustomizer` defined at the persistence unit level;
- `DescriptorCustomizer` defined at the entity level.

## SessionCustomizer

The session initiation usually takes place just before the creation of the first entity manager (persistence context). One of the
last steps during the initialization is the configuration. The interface provides us with only one customize method with a session
parameter. From the session, we can read the initialized metadata in the form of entity descriptors (#1) detected in the
previous stages of this process.

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

The *entity listener* (#2) associated with the class previously discovered contains references to the associated lifecycle methods
of the entity (#3). Knowing that the EclipseLink *POST\_CLONE* event (#4) is attached to the `@PostLoad` method, we might as well
attach it to the *POST\_BUILD* event (#5).

In the above solution, there is [a situation]((https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149)) where the *postLoad* method will be called twice (during *build* and *clone*). This can
happen when objects are cloned in a unit of work (persistence unit). With
the intermediate listener (#6), you can cover this case and conditionally (#7) delegate the *postBuild* to the *postClone* of the basic
listener (#8):


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

We apply the configurator in the *persistence.xml* file (the proper namespace may differ between JPA versions *2.x*
and *3.x*). Define this by providing the package name of the class under the `eclipselink.session.customizer` property:

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

A similar extension can be implemented on the entity level. At the time of configuration, the standard
`EntityListener` will not be initialized in this case (#9). However, nothing prevents you from moving the necessary parts
of the code (#2, #7, #9) to the event processing. In fact, we could refactor the example from point #8 in
the same way.

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

The `org.eclipse.persistence.annotations.Customizer` annotation can be used to apply the customizer i.e.
`@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)`. Alternatively, you can also do it through the
[persistence descriptor](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm) or
through the EclipseLink [ORM descriptor](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC).

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="@PostLoad method attached to the POST_BUILD event" title="@PostLoad method attached to the POST_BUILD event">

Keep in mind that an internal EclipseLink interface
`org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener` was used in this sample (EL 2.7.4).
To remove this dependency, all you need to do is to figure out your own way to lookup the `@PostLoad` annotated methods.
Note, however, that such methods can also be found in the parent classes marked with `@MappedSuperclass` annotation.
