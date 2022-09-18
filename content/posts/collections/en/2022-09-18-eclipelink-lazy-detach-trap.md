---
title: EclipseLink detached lazy field access trap (change tracking)
url: eclipselink-detached-lazy-field-access-fetch-change-tracking
id: 95
category:
  - jpa: JPA
tags:
  - eclipselink
  - performance
author: Damian Terlecki
date: 2022-09-18T20:00:00
---

Within the JPA specification the behavior of accessing detached entity's lazy un-fetched attribute is not clearly described.
A noteworthy behavior of the EclipseLink, in comparison to the OpenJPA/Hibernate, is that it will try to load such an attribute
when the weaving is enabled. Weaving here means to manipulate the byte code of compiled Java classes.

# Lazy fetch after detach

If you're working with the EclipseLink, getting *EclipseLink-7242* error might be nothing new for you.

> Caused by: Exception [EclipseLink-7242] (Eclipse Persistence Services - 2.7.10.v20211216-fe64cd39c3): org.eclipse.persistence.exceptions.ValidationException
Exception Description: An attempt was made to traverse a relationship using indirection that had a null Session.  
This often occurs when an entity with an uninstantiated LAZY relationship is serialized and that relationship is traversed after serialization.  
To avoid this issue, instantiate the LAZY relationship prior to serialization.

However, a bigger trap lies in accessing a lazy field after the `detach()` but before the persistence context is closed.
Imagine you've fetched some entity and want to initialize its lazy attribute with a value from memory before returning it to the client.

Due to change tracking, EclipseLink will first fetch this attribute from the database before assigning your value.
You will bear the cost of an additional query, at best, at worst multiple queries for all eager relationships of the fetched attribute.
See the following `Order` entity definition that has a lazy `@OneToMany` relationship to some `OrderItem`s and those to a `Product` entity:

```java
import lombok.Getter;
import lombok.Setter;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OneToOne;
import javax.persistence.Table;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "order")
    private List<OrderItem> items;

    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
}
```

Now, let's try to initialize the items after detaching the order but before closing the persistence context.
In a real-life scenario, you might do this to reduce the number of queries by reusing either already loaded data (cache) or
computing it using other information.

```java
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.Arrays;
import java.util.List;

@SpringBootTest
public class LazyTest {
    private final List<OrderItem> previouslyLoadedOrderItems = Arrays.asList(
            //...
    );

    @PersistenceContext(name = "my-pu")
    private EntityManager entityManager;

    @Test
    public void testFetchLazyAfterDetach() {
        Order order = entityManager.createQuery("SELECT o FROM Order o", Order.class)
                .setMaxResults(1)
                .getSingleResult();
        entityManager.detach(order);
        System.out.println("Order has been detached");
        order.setItems(previouslyLoadedOrderItems);
    }
}
```

Setting the `<property name="eclipselink.logging.level" value="FINEST"/>` in the *persitence.xml* will provide logs of what's happening behind the scenes.
If the weaving is disabled, no additional action is performed after the "Order has been detached".
However, try running the test with a dynamic weaving:
- in JEE, this is usually auto-enabled by a supporting application server;
- in JSE, you can test this configuring a Java agent. You can point it to the EclipseLink artifact from the local Maven repository, e.g.: `java -javaagent:C:/Users/t3rmian/.m2/repository/org/eclipse/persistence/eclipselink/2.7.10/eclipselink-2.7.10.jar ...`

This time you will see additional queries that fetch the `items` relation:
```java
Order has been detached
[EL Finest]: query: 2022-09-18 17:10:10.61--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadAllQuery(name="items" referenceClass=OrderItem )
[EL Fine]: sql: 2022-09-18 17:10:10.612--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT id, price, quantity, order_id, product_id FROM order_items WHERE (order_id = ?)
	bind => [1]
[EL Finest]: query: 2022-09-18 17:10:10.627--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="order" referenceClass=Order )
[EL Finest]: query: 2022-09-18 17:10:10.628--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="product" referenceClass=Product )
[EL Fine]: sql: 2022-09-18 17:10:10.628--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT ID, CODE, DESCRIPTION, NAME FROM products WHERE (ID = ?)
	bind => [1]
[EL Finest]: query: 2022-09-18 17:10:10.637--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="order" referenceClass=Order )
[EL Finest]: query: 2022-09-18 17:10:10.637--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="product" referenceClass=Product )
[EL Fine]: sql: 2022-09-18 17:10:10.637--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT ID, CODE, DESCRIPTION, NAME FROM products WHERE (ID = ?)
	bind => [2]
```

## Change tracking

Enabling static weaving will give us more insight into the process responsible for this behavior.
EclipseLink provides a `org.eclipse.persistence.tools.weaving.jpa.StaticWeave` program, which you can use to weave classes manually.
The `staticweave-maven-plugin` facilitates this process, assuming you're using Maven:
```xml
<build>
    <plugins>
        <plugin>
            <groupId>de.empulse.eclipselink</groupId>
            <artifactId>staticweave-maven-plugin</artifactId>
            <version>1.0.0</version>
            <executions>
                <execution>
                    <phase>process-classes</phase>
                    <goals>
                        <goal>weave</goal>
                    </goals>
                    <configuration>
                        <persistenceXMLLocation>META-INF/persistence.xml</persistenceXMLLocation>
                        <logLevel>FINE</logLevel>
                    </configuration>
                </execution>
            </executions>
            <dependencies>
                <dependency>
                    <groupId>org.eclipse.persistence</groupId>
                    <artifactId>org.eclipse.persistence.jpa</artifactId>
                    <version>2.7.10</version>
                </dependency>
            </dependencies>
        </plugin>
    </plugins>
</build>
```

After running the `mvn staticweave:weave` command, you should see weaved classes in your *target/classes* directory, and some descriptive logs in your
terminal. If you open the class file in the decompiler (e.g. in the IntelliJ IDE), you should see some additional code:

<img src="/img/hq/intellij-fernflower-decompiler.png" alt="FernFlower decompiler" title="FernFlower decompiler">

```java
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.util.List;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OneToOne;
import javax.persistence.Table;
import javax.persistence.Transient;
import javax.xml.bind.annotation.XmlTransient;
import org.eclipse.persistence.descriptors.changetracking.ChangeTracker;
import org.eclipse.persistence.internal.descriptors.PersistenceEntity;
import org.eclipse.persistence.internal.descriptors.PersistenceObject;
import org.eclipse.persistence.internal.identitymaps.CacheKey;
import org.eclipse.persistence.internal.jpa.EntityManagerImpl;
import org.eclipse.persistence.internal.jpa.rs.metadata.model.ItemLinks;
import org.eclipse.persistence.internal.jpa.rs.metadata.model.Link;
import org.eclipse.persistence.internal.weaving.PersistenceWeaved;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedChangeTracking;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedFetchGroups;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedRest;
import org.eclipse.persistence.queries.FetchGroup;
import org.eclipse.persistence.queries.FetchGroupTracker;
import org.eclipse.persistence.sessions.Session;

@Entity
@Table(
    name = "orders"
)
public class Order implements Cloneable, PersistenceWeaved, PersistenceEntity,
        PersistenceObject, FetchGroupTracker, PersistenceWeavedFetchGroups,
        ChangeTracker, PersistenceWeavedChangeTracking, PersistenceWeavedRest {
    //...
    @OneToMany(
            fetch = FetchType.LAZY,
            mappedBy = "order"
    )
    private List<OrderItem> items;
    
    protected transient PropertyChangeListener _persistence_listener;
    
    public List<OrderItem> getItems() {
        return this._persistence_get_items();
    }
    
    public void setItems(final List<OrderItem> items) {
        this._persistence_set_items(items);
    }
    
    public List _persistence_get_items() {
        this._persistence_checkFetched("items");
        return this.items;
    }

    public void _persistence_set_items(List var1) {
        this._persistence_checkFetchedForSet("items");
        this._persistence_propertyChange("items", this.items, var1);
        this.items = var1;
    }

    public void _persistence_checkFetched(String var1) {
        if (!this._persistence_isAttributeFetched(var1)) {
            EntityManagerImpl.processUnfetchedAttribute((FetchGroupTracker)this, var1);
        }

    }

    public void _persistence_checkFetchedForSet(String var1) {
        if (!this._persistence_isAttributeFetched(var1)) {
            EntityManagerImpl.processUnfetchedAttributeForSet((FetchGroupTracker)this, var1);
        }

    }

    public boolean _persistence_isAttributeFetched(String var1) {
        return this._persistence_fetchGroup == null ||
                this._persistence_fetchGroup.containsAttributeInternal(var1);
    }

    public void _persistence_setPropertyChangeListener(PropertyChangeListener var1) {
        this._persistence_listener = var1;
    }

    public void _persistence_propertyChange(String var1, Object var2, Object var3) {
        if (this._persistence_listener != null && var2 != var3) {
            this._persistence_listener
                    .propertyChange(new PropertyChangeEvent(this, var1, var2, var3));
        }

    }
    //...
}
```

A lot of generated code (though most of it has been skipped over), but if we look closer, the flow looks like this:
1. *setItems();*
2. *_persistence_set_items();*
3. *_persistence_propertyChange();*
4. *_persistence_listener.propertyChange();*

Now the standard implementation for the attribute change listener in the EclipseLink is `org.eclipse.persistence.internal.descriptors.changetracking.AttributeChangeListener`.
There is a flag after the pass of which the change is processed. During this time, the lazy database value holder is accessed, and we encounter the unnecessary (for this specific case) fetch.
This change tracking process is, on the other hand, quite useful. It optimizes the transaction and the commit phase.

Some ways to work around this feature are to:
- add `@ChangeTracking(value = ChangeTrackingType.DEFERRED)` annotation on the entity class level (deoptimized policy);
- employ your own `PropertyChangeListener` using a class/session descriptor (requires EclipseLink know-how);
- hack the behavior using reflection (unclean);
- use DTO (recommended).

## Summary

This behavior is specific to the EclipseLink as it is not in the scope of JPA specification.
In OpenJPA/Hibernate you might find it working differently, potentially without
causing you any issues.

> Be careful with the debugging. It is very easy to unintentionally trigger the lazy fetch (e.g. on displaying the data ) and end up with incorrect optimization conclusions.

> There are other [options](https://www.eclipse.org/eclipselink/documentation/2.7/concepts/app_dev005.htm#OTLCG94276) useful for configuring the weaving, e.g. `eclipselink.weaving.changetracking`, that can disable this tracking.

> Setting the `eclipselink.weaving` property in the *persistence.xml* only acts as a verification mechanism.


