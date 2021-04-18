---
title: Native SQL in JPA (EclipseLink) CriteriaBuilder
url: jpa-criteriabuilder-native-sql-eclipselink
id: 64
tags:
  - java
  - database
author: Damian Terlecki
date: 2021-04-18T20:00:00
---

When using the JPA CriteriaBuilder, sooner or later you will come across some limitations
that result from the specification. An example of such may be limiting the maximum number of results
returned in a subquery, or changing the NULL values sort order.
EclipseLink as an alternative to Hibernate offers quite a nice abstraction in the form of the
*JpaCriteriaBuilder* interface and the *ExpressionBuilder* class.

## TOP N Query

The TOP N query is a standard query in which we want to retrieve N records from the database,
most often sorted by some attribute we are interested in.
For example, we may want to find out the 5 best-rated products (H2 database syntax):

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 5;
```

We can easily build such a query using the *CriteriaBuilder* class (actually through `CriteriaQuery.orderBy()` and `Query.setMaxResults()`), to which we get a reference from the *EntityManager*.
In case we want to put them as a sub-query, the matter becomes more complicated.

The current version of JPA 2.2 does not provide us with such a possibility. We can, of course,
break our problem into two queries or consider a native solution. EclipseLink, however, provides
us with the *ExpressionBuilder* class, which is helpful in this situation.

ExpressionBuilder is a class used by internal components of EclipseLink.
What's important from the client's point of view, is that it returns Expression type objects that match the CriteriaBuilder interface.
Furthermore, a particularly useful method of this class is `public Expression sql(String sql, List arguments)`.

As the first parameter, we can provide a native SQL query.
Through the second parameter of the method, we can inject the arguments. 
The function will return an object that we can use depending on the purpose – as a sub-query, condition, or list of attributes.

## CriteriaBuilder – TOP N Subquery

Imagine a simple shop – some customers, orders, and products.
Suppose you want to find all customers who ordered one of the three lowest-rated products.
Perhaps you would like to give them a discount so that your store is not linked with negative thoughts.
A simplified class diagram of such a shop could look like this:

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="Class diagram for TOP N query sample" title="Simplified class diagram">

The expected TOP N query that we want the *CriteriaBuilder* to generate is:

```sql
SELECT t0.id, t0.firstname, t0.lastname
FROM customer t0
WHERE EXISTS(SELECT 1
             FROM orders t1
             WHERE ((t0.id = t1.customer_id)
                 AND (t1.product_id IN (SELECT id
                                        FROM products
                                        ORDER BY rating LIMIT 3))))
```

We will start from the *EntityManager*,
which you will probably inject based on the preferred platform.
Then the *ExpressionBuilder* will be used in the most nested query:

```java
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityManager;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Root;
import javax.persistence.criteria.Subquery;
import java.util.Collections;
/*...*/
public class MyService {
    /*...*/    
    @Transactional(readOnly = true)
    public List<Customer> findCustomersWithBadProducts() {
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Customer> criteriaQuery = criteriaBuilder.createQuery(Customer.class);
        Root<Customer> customer = criteriaQuery.from(Customer.class);
        Subquery<Order> orderSubQuery = criteriaQuery.subquery(Order.class);
        Root<Order> order = orderSubQuery.from(Order.class);
    
        criteriaQuery.where(
                criteriaBuilder.exists(
                        orderSubQuery.where(
                                criteriaBuilder.equal(customer.get("id"), order.get("customerId")),
                                order.get("productId").in(new ExpressionBuilder()
                                        .literal("id")
                                        .sql("SELECT ? FROM products ORDER BY rating LIMIT ?",
                                                Collections.singletonList(3)
                                        )
                                )
                        )
                )
        );
    
        return em.createQuery(criteriaQuery).getResultList();
    }
}
```

Voilà! Note that the sql method will select an expression already present in the builder for the first substitution,
as shown in the example. This is especially helpful when you want to add the native part of the query to the
very end of it.

By specifying objects of the *Path* type as parameters, we will also not get the expected result,
because the `toString()` method will be called on them instead of the database column name substitution.
Finally, you probably wouldn't choose this route unless you're implementing a complex API criteria support. 

