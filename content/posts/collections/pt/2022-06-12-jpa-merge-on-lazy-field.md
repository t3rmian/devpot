---
title: Merge de campo lazy no JPA
url: jpa-merge-em-campo-lazy-fetch
id: 88
category:
- jpa: JPA
tags:
- eclipselink
- desempenho
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

Na especificação JPA, o lazy fetching (carregamento tardio) é um método para otimizar o acesso a campos e relacionamentos persistidos no banco de dados, adiando a busca para o momento em que um determinado atributo é referenciado no código. Recentemente, me perguntaram o que aconteceria se fizéssemos o merge de uma entidade com atributos não buscados e anotados como lazy.

Um dos principais resultados da busca levará você a uma antiga [resposta no StackOverflow](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection). Lá, você encontrará uma pergunta relacionada a um caso em que a entidade é mapeada para um DTO e, em seguida, unida de volta com o merge. No exemplo fornecido, o mapeador ignora o campo com lazy-fetch, e como resultado, o relacionamento/atributo é removido.

## Wrapper de atributo lazy

No entanto, um resultado diferente será alcançado se você decidir mapear o campo com lazy-fetch. Se você tentar acessar tais atributos, o provedor JPA tentará buscar os valores do banco de dados. Fora do contexto de persistência (sem conexão com o banco de dados), você receberá uma exceção de inicialização lazy.

Por outro lado, se você mapear o campo por referência ou usar serialização, acabará com um wrapper específico do provedor sobre seu campo. Agora, o que acontecerá quando tal atributo entrar em uma operação de merge em um contexto de persistência diferente? Você talvez precise pré-carregar o campo? A especificação é clara aqui:

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. Merging Detached Entity State: [...] O provedor de persistência não deve fazer o merge de campos marcados como LAZY que não foram buscados: ele deve ignorar tais campos ao fazer o merge. [...]</br>
> 3.2.7.2. Detached Entities and Lazy Loading: [...] Um fornecedor é obrigado a suportar a serialização e a desserialização e o merge subsequentes de instâncias de entidades desanexadas (que podem conter propriedades ou campos lazy e/ou relacionamentos que não foram buscados) [...]

Assim, de forma nativa, o atributo lazy deve permanecer intacto. Você pode verificar ambos os casos executando um teste de integração simples:

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

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="Resultados do merge JPA em campo com lazy-fetch mapeado por DTO ou desserializado" title="Merge JPA em campo com lazy-fetch">
