---
title: JPA pole typu lazy a operacja merge
url: jpa-merge-lazy-fetch
id: 88
category:
  - jpa: JPA
tags:
  - eclipselink
  - wydajność
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

*Lazy fetching* w JPA to metoda optymalizacji dostępu do pól i relacji utrwalonych w bazie danych poprzez
opóźnienie pobierania danych do momentu, w którym dany atrybut jest faktycznie wykorzystywany w kodzie.
Jednym z podstawowych zagadnień związanych z tym mechanizmem jest rezultat operacji *merge* takich pól w przypadku, gdy nie zostały jeszcze zainicjalizowane.

W tym kontekście jeden z najpopularniejszych wyników wyszukiwarki jest [odpowiedź na StackOverflow](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection).
Znajdziesz tam pytanie dotyczące przypadku, w którym encja mapowana jest na DTO, a następnie z powrotem *merge*'owana. W podanym przykładzie
pole *lazy* jest pomijane, dlatego relacja ostatecznie zostaje usunięta.

## Wrapper atrybutu *lazy*

Inny wynik otrzymasz, jeśli jednak zdecydujesz się zmapować pole inicjalizowane leniwie. Przy próbie dostępu do takich atrybutów, implementacja JPA spróbuje pobrać wartości z bazy danych. Poza kontekstem (persistence context)
zostanie wyrzucony wyjątek leniwej inicjalizacji.

Z drugiej strony, jeśli zmapujesz pole przez zwykłe odwołanie (np. do kolekcji) lub użyjesz serializacji, otrzymasz właściwie
pewne opakowanie implementacyjne atrybutu, realizujące mechanizm leniwego ładowania.
Co się stanie, gdy taki atrybut dołączy do operacji *merge* w innym kontekście? Czy
potrzebujemy uprzednio doprowadzić do inicjalizacji tego pola? Z pomocą przyjdzie nam tu specyfikacja:

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. Merging Detached Entity State: \[...\] The persistence provider must not merge fields marked LAZY that have not been fetched: it must ignore such fields when merging. \[...\]</br>
> 3.2.7.2. Detached Entities and Lazy Loading: [...] A vendor is required to support the serialization and subsequent deserialization and merging of detached entity instances (which may contain lazy properties or fields and/or relationships that have not been fetched) \[...\]

Na podstawie powyższego, leniwy atrybut bądź relacja powinna pozostać bez zmian. Oba przypadki możesz zweryfikować, uruchamiając prosty test integracyjny:

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
        assertThrows(ValidationException.class, () -> product.getStocks().isEmpty());
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

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="Wynik operacji JPA merge pola typu lazy-fetch w przypadku mapowania DTO i deserializacji" title="JPA merge pola lazy-fetch">
