---
title: JPQL JOIN FETCH with CursoredStream/ScrollableCursor
url: jpql-join-fetch-distinct-cursoredstream-scrollablecursor
id: 66
tags:
  - java
  - bazy danych
author: Damian Terlecki
date: 2021-05-16T20:00:00
---

In the JPA 2.2, a new method has been added to the *javax.persistence.Query* interface, `Stream getResultStream()`, which allows
for easy implementation of stream processing. By design, however, how this method is implemented is left to the discretion of the
JPA provider. Most often, though, it is just an invocation of `stream()` method on the list returned by `Query.getResultList()`:

```java
package javax.persistence;
/**/
public interface Query {
    /**
     * Execute a SELECT query and return the query results
     * as an untyped <code>java.util.stream.Stream</code>.
     * By default this method delegates to <code>getResultList().stream()</code>,
     * however persistence provider may choose to override this method
     * to provide additional capabilities.
     *
     * @return a stream of the results
     * @throws (...)
     * @see Stream
     * @see #getResultList()
     * @since 2.2
     */
    default Stream getResultStream() {
        return getResultList().stream();
    }
    /**/
}
```

When looking for a solution for processing a large number of records, taking into account memory with a finite area, loading the entire list
may not be the best idea. For this purpose, cursors are a perfect choice. Proper use of which allows for
reducing the memory usage to a relatively low level. Examples of such cursors are:
- *org.eclipse.persistence.queries.CursoredStream* – cursor in the EclipseLink;
- *org.eclipse.persistence.queries.ScrollableCursor* – multidirectional cursor in the EclipseLink;
- *org.hibernate.ScrollableResults* – cursor in the Hibernate.

Assuming that we need to fetch entities from several tables for our processing, one of the options is
to use the JPQL operator `[LEFT [OUTER] | INNER] JOIN FETCH join_association_path_expression`. JOIN FETCH
allows you to get rid of the N+1 problem, in which we still have to fetch each related entity for the root one.
How we do resolve this will influence the performance of our application in the end.

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

Basically, in EclipseLink apart from JOIN FETCH we can also choose one of the 
two other solutions [(BatchFetchType EXISTS and IN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html),
which are optimal for complex relationships.
In return for an additional query (IN/EXISTS) for each relation, EL does not need to process duplicate records resulting from the join.
However, these alternatives do not work very well in the case of the cursor, where we usually have to retrieve related data after obtaining each subsequent object.
In this case, the solution with EXISTS and IN degrades back to the starting point.


As you can see, duplicates are a problem with the JOIN FETCH. Given a simple shop model: customer (1) -> (N) order
and the JPQL query for an entity with such (**@OneToMany**) relation:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
we can expect EclipseLink to generate a single SQL query:
```sql
SELECT t1.ID,
       t1.FIRSTNAME,
       t1.LASTNAME,
       t0.ID,
       t0.ADDRESSID,
       t0.CUSTOMERID,
FROM orders t0,
     customers t1
WHERE (t0.CUSTOMERID = t1.ID)
```
and expect a list of duplicated customers in case they have made multiple orders:
```sql
[{Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

### JPQL DISTINCT SELECT

The solution to the duplication problem in JPQL is to use the DISTINCT operator on the entity itself:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```
In this way, with one query, we get deduplicated list of customers along with their orders:
```sql
[{Customer C, id=3, orders=[38, 42, 52, 53, 54, 34]},
 {Customer B, id=2, orders=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
A side effect of this is the addition of the DISTINCT operator also in the generated SQL query.
Hibernate deals with this problem by providing the user with [*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/)
hint, whereas in EclipseLink I could not find such equivalent.

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor DISTINCT SELECT

Applying the knowledge about the DISTINCT operator also to the *CursoredStream* cursor, we may come a bit surprised.

```java
Query query = em.createQuery("""
    SELECT DISTINCT customer
    FROM Customer customer
    JOIN FETCH customer.orders
""");
query.setHint("eclipselink.cursor", true); // org.eclipse.persistence.config.QueryHints.CURSOR
CursoredStream cursor = (CursoredStream) query.getSingleResult();
while (cursor.hasNext()) {
    System.out.println(cursor.next());
}
cursor.close();
```

The above code can produce similar results as below:
```java
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}
{Customer B, id=2, orders=[10]}
/**/
```

However, even without the DISTINCT, we can still get lucky and get deduplicated records. Why is that?
The basic principle on which deduplication is performed in *CursoredStream/ScrollableCursor* is the order of the primary key values in subsequent rows
returned from the query. If the database returns rows with the same primary key scattered around the result set, then
EclipseLink will process them as different objects.

To solve the problem, we just need to specify the sort order:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```
This way we get the same result as with `getResultList()`:
```java
{Customer B, id=2, orders=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{Customer C, id=3, orders=[42, 52, 53, 54, 34, 38]}
```

Finally, it's also worth optimizing our cursor:
- *QueryHints.SCROLLABLE_CURSOR* – allows you to use ScrollableCursor instead (can move backward);
- *QueryHints.RESULT_SET_TYPE* – defines the direction of the cursor;
- *QueryHints.RESULT_SET_CONCURRENCY* – enables optimization for reading;
- *QueryHints.CURSOR_INITIAL_SIZE* – configures the number of objects pre-build for the first page of the cursor;
- *QueryHints.CURSOR_PAGE_SIZE* – defines the number of objects fetched (the `next()` method) when the buffer is empty;
- *QueryHints.READ_ONLY* – enabled when registration in the persistence context is not needed (reduces memory consumption).
