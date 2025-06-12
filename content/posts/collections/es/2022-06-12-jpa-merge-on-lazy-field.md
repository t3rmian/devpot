---
title: Fusión de campos lazy en JPA
url: jpa-merge-on-lazy-fetch-field
id: 88
category:
  - jpa: JPA
  # "JPA" se mantiene como término estándar
  
tags:
  - eclipselink
  - rendimiento
  # "performance" traducido como "rendimiento"
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

En la especificación de JPA, la obtención perezosa (lazy fetching) es un método para optimizar el acceso a campos y relaciones persistidos en la base de datos, retrasando la carga hasta el momento en que el atributo es referenciado en el código. Recientemente, me preguntaron qué sucede al fusionar (merge) una entidad con atributos anotados como lazy que no han sido recuperados.

Uno de los primeros resultados en la búsqueda te llevará a esta [respuesta antigua en StackOverflow](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection). Allí encontrarás una pregunta relacionada con el caso en que una entidad se mapea a un DTO y luego se fusiona de nuevo. En el ejemplo, el mapeador omite el campo lazy, y como resultado la relación/atributo se elimina.

## Envoltorio de atributos lazy

Sin embargo, el resultado será diferente si decides mapear el campo lazy. Si intentas acceder a dichos atributos, el proveedor JPA intentará obtener los valores desde la base de datos. Fuera del contexto de persistencia (es decir, fuera de la conexión a la base de datos), recibirás una excepción de inicialización perezosa.

Por otro lado, si mapeas el campo por referencia o usas serialización, terminarás con un envoltorio específico del proveedor sobre tu campo. Ahora bien, ¿qué sucede cuando ese atributo participa en una operación de merge en un contexto de persistencia diferente? ¿Es necesario pre-cargar el campo? La especificación es clara aquí:

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. Fusión del estado de entidad separada: \[...\] El proveedor de persistencia no debe fusionar los campos marcados como LAZY que no han sido recuperados: debe ignorar dichos campos al fusionar. \[...\]</br>
> 3.2.7.2. Entidades separadas y carga perezosa: [...] Se requiere que un proveedor soporte la serialización y posterior deserialización y fusión de instancias de entidades separadas (que pueden contener propiedades o campos lazy y/o relaciones que no han sido recuperadas) \[...\]

Por lo tanto, de forma predeterminada, el atributo lazy debería permanecer intacto. Puedes verificar ambos casos ejecutando una simple prueba de integración:

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

    private Product product; // propietario de la relación lazy en cascada

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
            assertTrue(product.getStocks().isEmpty()); // relación lazy desvinculada en el merge
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
            assertFalse(product.getStocks().isEmpty()); // campo lazy ignorado en el merge
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

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="Resultados de merge en campo lazy mapeado por DTO o deserializado" title="JPA merge en campo lazy">
