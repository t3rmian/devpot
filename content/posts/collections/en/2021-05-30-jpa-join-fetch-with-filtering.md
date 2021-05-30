---
title: JPQL JOIN FETCH with a condition
url: jpql-join-fetch-with-condition
id: 67
tags:
  - java
  - database
author: Damian Terlecki
date: 2021-05-30T20:00:00
---

One of the interesting cases related to building JPQL (Java Persistence Query Language) queries
is the possibility of filtering out the related entities when using the JOIN FETCH clause.
The JPA specification version 2.2 ([JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf))
defines the following syntax for JPQL queries using JOIN and JOIN FETCH.

```groovy
join ::= join_spec join_association_path_expression [AS] identification_variable [join_condition]

fetch_join ::= join_spec FETCH join_association_path_expression

join_association_path_expression ::=
    join_collection_valued_path_expression |
    join_single_valued_path_expression |
    TREAT(join_collection_valued_path_expression AS subtype) |
    TREAT(join_single_valued_path_expression AS subtype)

join_collection_valued_path_expression ::=
    identification_variable.{single_valued_embeddable_object_field.}*collection_valued_field

join_single_valued_path_expression ::=
    identification_variable.{single_valued_embeddable_object_field.}*single_valued_object_field

join_spec ::= [ LEFT [OUTER] | INNER ] JOIN

join_condition ::= ON conditional_expression
```

From this, we can see that in the case of a JOIN FETCH it is not possible to give an alias or define additional join conditions.
Nevertheless, both EclipseLink and Hibernate as JPA specification implementations, in their JPQL extensions - respectively
EQL (EclipseLink Query Language) and HQL (Hibernate Query Language) give developers a wider range of possibilities.

So let's take a simple model of a shop in which we have a customer (1) - (N) orders relation. Knowing the order ID,
let's try to fetch information about the customer and only this specific order using a single JPQL query from the database.

```java
@Entity
@Table(name = "customers")
public class Customer {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    private String firstName;
    private String lastName;
    
    @OneToMany(mappedBy = "customer")
    private List<Order> orders;
    //...
}

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    @Column(name="CUSTOMERID")
    private Long customerId;

    @ManyToOne
    @JoinColumn(name = "CUSTOMERID", referencedColumnName = "ID", insertable = false, updatable = false)
    private Customer customer;
    //...
}
```

To illustrate the query results, let's assume the following database state:
```sql
[{Customer A, id=1, orders=[]},
 {Customer B, id=2, orders=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

## EQL JOIN FETCH with a condition

EclipseLink in the case of JOIN FETCH allows both the use of a condition in the ON clause and the definition of such a condition
in a WHERE clause by referencing a JOIN alias.

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

EclipseLink will generate the following SQL query:

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### Cache

Whether the EclipseLink will return a customer with a filtered list of orders `[{Customer B, id = 2, orders = [10]}]`
or with all orders of this customer `[{Customer B, id = 2, orders = [10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]`, depends on
the cache settings. There is a reason that in the [JPQL EclipseLink documentation](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL),
the following note can be found:

> JOIN FETCH normally does not allow an alias, but as of EclipseLink 2.4 an alias is allowed. The alias should be used with caution, as it can affect how the resulting objects are built. Objects should normally always have the same data, no matter how they were queried, this is important for caching and consistency.<br/>This is only an issue if the alias is used in the WHERE clause on a collection relationship to filter the related objects that will be fetched. This should not be done, but is sometimes desirable, in which case the query should ensure it has been set to BYPASS the cache.

For example, if in the same transaction we previously fetched our client from the database `SELECT c FROM Customers c WHERE c.id = 2`
and the object was registered in the first level cache (*EntityManager*); or we have enabled the second level cache (*EntityManagerFactory*)
and the object was added there as a result of another transaction, we will receive a full list of customer's orders.

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="JPA L1 and L2 Cache" title="JPA L1 and L2 Cache">

If you want to receive a list with the specific order, in this case, add a hint for EclipseLink to skip both L1 and L2 cache 
to the *Query* type object: `query.setHint("eclipselink.maintain-cache", "false")`. This way EL will build the object directly from the query results
and won't litter the context with an inconsistent object from the JPA point of view.

### Distinct

If, after applying the condition, we expect to fetch not one, but N related entities, then we should use the DISTINCT clause:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **Note:** Be careful not to use parentheses with the DISTINCT clause e.g.: DISTINCT(c). EclipseLink is sensitive to this and will generate quite questionable queries, to the point of dropping the condition in the case of the ON clause:
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## HQL JOIN FETCH with a condition

Similar to EclipseLink, Hibernate also supports defining a condition by referencing an alias:

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

However, defining such condition in the ON clause is forbidden:

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### Cache

Also in the case of Hibernate, we will have to take into account possible cache problems. In order not to clutter the L1 cache, one option is to create
a separate [stateless session](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html) reusing the same connection.
Such a session does not implement the L1 cache and does not interact with the L2 cache:
```java
Session session = em.unwrap(Session.class);
SessionFactory sessionFactory = session.getSessionFactory();
List<Customer> customers = session.doReturningWork(connection -> {
    StatelessSession statelessSession = sessionFactory.openStatelessSession(connection);
    return statelessSession.createQuery("""
        SELECT c
        FROM Customer c
        JOIN FETCH c.orders o
        WHERE o.id = 10
        """, Customer.class).getResultList();
});
```

### Distinct 

Likewise, if after applying the condition we expect to fetch not one, but N related entities, then we should add the DISTINCT clause:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

This way, we eliminate the problem of duplicate objects at the parent (in this case, client) level:
```sql
--Distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]}]
--Without distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]},
 {Customer B, id=5, orders=[10, 49]}]
```

Through the application of the "*hibernate.query.passDistinctThrough*" hint with a "*false*" value, we can also get rid of the DISTINCT clause from the
SQL query. The database will get a little breather, and Hibernate will not forget about deduplication as well.

## Summary

Whereas the JPA specification does not allow for adding conditions on the related entities in the JOIN FETCH clause,
both EclipseLink and Hibernate offer such possibility.
In both cases, however, we should be careful when building such queries and take into account possible problems with cache and duplication of returned objects.
This will also be important depending on whether you need the results as managed objects or not.