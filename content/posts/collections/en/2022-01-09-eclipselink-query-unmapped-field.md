---
title: JPA (EclipseLink) queries with an unmapped database column
url: jpa-eclipselink-queries-with-unmapped-db-column
id: 77
tags:
  - java
  - database
author: Damian Terlecki
date: 2022-01-09T20:00:00
---

The main idea behind the JPA is the object-relational mapping,
thanks to which we can forget about database columns when creating queries and work with mapped object properties.
However, if we want to refer to a column that is not mapped,
depending on the way we build the query, it may be necessary to use an interface provided by the JPA-specific implementation, such as EclipseLink.

For example, let's take a simple users table:

```sql
CREATE TABLE users
(
    id     BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    hidden BOOLEAN DEFAULT false,
    name   VARCHAR(255),
    PRIMARY KEY (id)
);
INSERT INTO users (name, hidden) VALUES ('Adam', true);
INSERT INTO users (name, hidden) VALUES ('Damian', false);
INSERT INTO users (name, hidden) VALUES ('Emma', true);
INSERT INTO users (name, hidden) VALUES ('Alice', false);
```

In the definition of the entity class, I intentionally omit the mapping for the `hidden` column:

```java
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;

@Getter
@Setter
@ToString(exclude = "id")
@Entity
@Table(name="users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;

}
```

Now suppose we want to construct a query based on the hidden column, we can begin the query building with:
1. The JPA CriteriaBuilder interface which allows reference through mapped fields. To construct a direct reference to the column you need to use the interface of a JPA implementation. In the case of EclipseLink, the steps would be:
  - downcasting the CriteriaBuilder to JpaCriteriaBuilder;
  - converting the entity reference to EL-specific `org.eclipse.persistence.expressions.Expression`, creating the column reference via `getField()` and converting it back to the JPA-compatible form;
  - adding the relevant condition;
2. The JPQL syntax – as above – we can use EL-specific syntax: `WHERE SQL('hidden = true')`;
3. A native query.

```java
import org.eclipse.persistence.jpa.JpaCriteriaBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Expression;
import java.util.List;

@SpringBootTest
class DemoApplicationTests {

    @PersistenceContext
    EntityManager em;

    @Test
    void testUnmappedFieldCriteria() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        List<User> users = em.createQuery(criteria).getResultList();
        System.out.println("All users: " + users);

        // #1
        JpaCriteriaBuilder jpaBuilder = (JpaCriteriaBuilder) builder;
        Expression<Boolean> hiddenField = jpaBuilder.fromExpression(
                jpaBuilder.toExpression(criteria.from(User.class)).getField("hidden"),
                Boolean.class
        );
        users = em.createQuery(criteria.where(builder.equal(hiddenField, false)))
                .getResultList();
        System.out.println("#1 Visible users using JpaCriteriaBuilder: " + users);

        // #2
        users = em.createQuery("SELECT u FROM User u WHERE SQL('hidden = true')", User.class)
                .getResultList();
        System.out.println("#2 Hidden users using JPQL (EL-flavored): " + users);

        // #3
        users = em.createNativeQuery("SELECT * FROM users WHERE hidden = true", User.class)
                .getResultList();
        System.out.println("#3 Hidden users using native query: " + users);
    }

}
```

In all cases shown, EclipseLink generates the correct query returning the expected results:
```java
[EL Fine]: sql: 2022-01-09 13:51:28.215--ServerSession(2027837674)--Connection(1139915666)--Thread(Thread[main,5,main])--SELECT ID, NAME FROM users
All users: [User(name=Adam), User(name=Damian), User(name=Emma), User(name=Alice)]

[EL Fine]: sql: 2022-01-09 13:51:28.258--ServerSession(2027837674)--Connection(1139915666)--Thread(Thread[main,5,main])--SELECT ID, NAME FROM users WHERE (hidden = ?)
    bind => [false]
#1 Visible users using JpaCriteriaBuilder: [User(name=Damian), User(name=Alice)]

[EL Fine]: sql: 2022-01-09 13:51:28.616--ServerSession(2027837674)--Connection(1139915666)--Thread(Thread[main,5,main])--SELECT ID, NAME FROM users WHERE hidden = true
#2 Hidden users using JPQL (EL-flavored): [User(name=Adam), User(name=Emma)]

[EL Fine]: sql: 2022-01-09 13:51:28.634--ServerSession(2027837674)--Connection(1139915666)--Thread(Thread[main,5,main])--SELECT * FROM users WHERE hidden = true
#3 Hidden users using native query: [User(name=Adam), User(name=Emma)]
```

For other JPA implementations, you might find similar interfaces. For example, Hibernate offers the [*Restrictions.sqlRestriction*](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/criterion/Restrictions.html#sqlRestriction-java.lang.String-)
methods during the construction of the criteria that can be used to achieve the same result.