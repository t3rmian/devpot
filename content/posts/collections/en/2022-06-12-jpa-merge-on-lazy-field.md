---
title: JPA lazy field merge
url: jpa-merge-on-lazy-fetch-field
id: 88
category:
  - jpa: JPA
tags:
  - eclipselink
  - performance
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

In the JPA specification, lazy fetching is a method to optimize access to fields and relations persisted in the database
by delaying the fetching to the moment when given attribute is referenced in the code. Recently, I've been asked what
will happen when we merge an entity with lazy-annotated un-fetched attributes.

One of the top results found in the search will point you to the aged [answer on StackOverflow](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection).
There you will find a question related to a case where the entity is mapped to a DTO and then merged back.
In the provided example, the mapper skips the lazy-fetched field, and as a result the relationship/attribute is removed.

## Lazy attribute wrapper

However, a different result will be achieved if you decide to map the lazy-fetched field.
If you try to access such attributes, the JPA provider will try to fetch the values from the DB.
Outside the persistence context (outside the connection to the database), you will receive a lazy initialization exception.

On the other hand, if you map the field by reference or use serialization, you will end up with a
provider-specific wrapper over your field. Now, what will happen when such attribute joins a merge operation
in a different persistence context? Do you maybe need to prefetch the field? The specification is clear here:

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. Merging Detached Entity State: \[...\] The persistence provider must not merge fields marked LAZY that have not been fetched: it must ignore such fields when merging. \[...\]</br>
> 3.2.7.2. Detached Entities and Lazy Loading: [...] A vendor is required to support the serialization and subsequent deserialization and merging of detached entity instances (which may contain lazy properties or fields and/or relationships that have not been fetched) \[...\]

Thus, out of the box, the lazy attribute should stay intact. You can verify both cases by running a simple integration test:

```java
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceUnit;
import jakarta.persistence.Query;
import org.eclipse.persistence.exceptions.ValidationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.wildfly.common.Assert.assertFalse;
import static org.wildfly.common.Assert.assertTrue;

@SpringBootTest
public class LazyMergeTest {

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;

    private Product product; // owner of the cascaded lazy relation

    @BeforeEach
    public void setUp() {
        invokeInTransaction((em) -> Stream.of(
                "DELETE FROM stock WHERE product_id = 1",
                "DELETE FROM product WHERE id = 1",
                "INSERT INTO product (id, name) VALUES (1, 'Car')",
                "INSERT INTO stock (id, product_id, total) VALUES (1, 1, 10)"
        ).map(em::createNativeQuery).forEach(Query::executeUpdate));
    }

    @Test
    public void testMergeLazyField_InitializeAsEmptyInDTO() {
        invokeInTransaction((em) -> {
            product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertNotEquals("Test", product.getName());
        });

        product = new Product(product.getId());
        product.setName("Test");
        invokeInTransaction((entityManager) -> product = entityManager.merge(product));

        invokeInTransaction((em) -> {
            Product product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertEquals("Test", product.getName());
            assertTrue(product.getStocks().isEmpty()); // lazy relation unlinked on merge
            // [EL Fine]: (...) UPDATE STOCK SET product_id = ? WHERE ((product_id = ?) AND (ID = ?))
            // bind => [null, 1, 1]
        });
    }

    @Test
    public void testMergeLazyField_IgnoreOnMerge() {
        invokeInTransaction((em) -> {
            product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertNotEquals("Test", product.getName());
        });

        product = deserialize(serialize(product));
        var exception = assertThrows(ValidationException.class, () -> product.getStocks().isEmpty());
        var message = "An attempt was made to traverse a relationship using indirection that had a null Session";
        assertThat(exception.getMessage(), containsString(message));
        product.setName("Test");
        invokeInTransaction((em) -> product = em.merge(product));

        invokeInTransaction((em) -> {
            Product product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertEquals("Test", product.getName());
            assertFalse(product.getStocks().isEmpty()); // lazy field ignored ignored on merge
        });
    }

    private void invokeInTransaction(Consumer<EntityManager> transaction) {
        EntityManager em = entityManagerFactory.createEntityManager();
        em.getTransaction().begin();
        transaction.accept(em);
        em.getTransaction().commit();
    }


    private static byte[] serialize(Object object) {
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ObjectOutputStream out = new ObjectOutputStream(bos)) {
            out.writeObject(object);
            out.flush();
            return bos.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private static <T> T deserialize(byte[] bytes) {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(bytes);
             ObjectInputStream in = new ObjectInputStream(bis)) {
            return (T) in.readObject();
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException(e);
        }
    }
}
```

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="JPA merge results on lazy-fetch field mapped by DTO or deserialized" title="JPA merge on lazy-fetch field">
