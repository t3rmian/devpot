---
title: JPA遅延フィールドのマージ
url: jpa-遅延フェッチ-フィールド-マージ
id: 88
category:
- jpa: JPA
tags:
- eclipselink
- パフォーマンス
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

JPA仕様において、遅延フェッチはデータベースに永続化されたフィールドやリレーションへのアクセスを最適化する手法です。
特定の属性がコードで参照されるまでフェッチを遅らせることで実現します。最近、遅延アノテーションが付いた未フェッチの属性を持つエンティティをマージすると
何が起こるか尋ねられました。

検索で最初に出てくる結果の一つに、[StackOverflowの古い回答](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection)があります。
そこでは、エンティティがDTOにマッピングされ、その後マージされるケースに関する質問がされています。
提供された例では、マッパーは遅延フェッチされたフィールドをスキップし、その結果リレーションシップ/属性が削除されます。

## 遅延属性ラッパー

しかし、遅延フェッチされたフィールドをマッピングすることにした場合、異なる結果が得られます。
そのような属性にアクセスしようとすると、JPAプロバイダーはデータベースから値を取得しようとします。
永続性コンテキストの外部（データベースへの接続外）では、遅延初期化例外が発生します。

一方、参照によってフィールドをマップしたり、シリアライゼーションを使用したりすると、
フィールドの上にプロバイダー固有のラッパーができます。では、そのような属性が別の永続性コンテキストでマージ操作に参加するとどうなるのでしょうか？
フィールドを事前にフェッチする必要があるのでしょうか？仕様はここで明確です：

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. デタッチされたエンティティ状態のマージ: \[...] 永続性プロバイダーは、フェッチされていないLAZYとマークされたフィールドをマージしてはなりません。マージする際にそのようなフィールドを無視しなければなりません。\[...]</br>
> 3.2.7.2. デタッチされたエンティティと遅延ローディング: [...] ベンダーは、デタッチされたエンティティインスタンス（フェッチされていない遅延プロパティやフィールド、および/またはリレーションシップを含む可能性がある）のシリアライゼーションとそれに続くデシリアライゼーションおよびマージをサポートする必要があります。\[...]

したがって、デフォルトでは、遅延属性はそのまま残るはずです。簡単な統合テストを実行することで、両方のケースを確認できます。

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

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="DTOまたはデシリアライズによってマッピングされた遅延フェッチフィールドでのJPAマージ結果" title="遅延フェッチフィールドでのJPAマージ">

