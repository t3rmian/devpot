---
title: EclipseLink JPQLでロックオプションを拡張する
url: eclipselink-拡張-ロック-オプション
id: 82
category:
- jpa: JPA
tags:
- sql
- oracle
- パフォーマンス
- eclipselink
author: Damian Terlecki
date: 2022-03-20T20:00:00
---

JPA仕様では、通常データベース間で実装されるエンティティロックオプションの共通サブセットしか許可されていません。
より具体的なロックオプションを選択する必要に迫られた場合、ネイティブクエリに頼らざるを得ません。
しかし、すでに複雑なJPQLコードがある場合、ベンダー固有のロックを採用する方法はないのでしょうか？

EclipseLinkは、*org<wbr>.eclipse<wbr>.persistence<wbr>.internal<wbr>.databaseaccess<wbr>.DatabasePlatform*クラスの下でデータベース固有の動作を実装しています。
標準パッケージ内には、MySQL、PostgreSQL、Oracleなど、いくつかの異なるプラットフォームがあります。
クエリの構築にカスタム動作が必要な場合、ビルダーはプラットフォームの実装を呼び出します。
スタックトレースをたどることで、クエリのロック部分を構築するために使用されるポイントとインターフェースを簡単に見つけることができます。
ご想像の通り、これはデータベース間で依然として異なります。

EclipseLinkがこれをどのように処理するか見てみましょう。Oracle固有の`SELECT FOR UPDATE OF`と
`SKIP LOCKED`句でロックを拡張してみます。

## JPQL SELECT FOR UPDATE OF / SKIP LOCKED

クエリの実装に入るには、内部インターフェースにアンラップすることができます。
EclipseLinkでオブジェクトを使用するすべての読み取りクエリは、*ObjectLevelReadQuery*クラスを使用します。
ただし、基盤となるクエリをいじり始める前に、EclipseLinkの内部について一つ注意してください。
クエリは共有される可能性があります。副作用を防ぐために、読み取りクエリをクローンし、ラッパー内の参照を更新します。

```java
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;
import org.eclipse.persistence.internal.jpa.QueryImpl;
import org.eclipse.persistence.queries.ObjectLevelReadQuery;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {

    //...
    
    private ExpressionBuilder clone(Query query) {
        QueryImpl queryImpl = query.unwrap(QueryImpl.class);
        ObjectLevelReadQuery objectLevelReadQuery = (ObjectLevelReadQuery) query
                .unwrap(ObjectLevelReadQuery.class).clone();
        queryImpl.setDatabaseQuery(objectLevelReadQuery);
        objectLevelReadQuery.setLockingClause(this);
        return objectLevelReadQuery.getExpressionBuilder();
    }
}
```

*ObjectLevelReadQuery*のインターフェースは、ロッキング句を挿入する方法を提供します。この句は、ロッキング部分を出力する一種のビルダーインターフェースです。
デフォルトでは、*ForUpdateClause*がここで使用されます。この実装は、
標準ロック、待機タイムアウト、および待機なし句をサポートしています。

さらに、*ForUpdateOfClause*があります。しかし、これは待機および待機なし句をサポートしていませんが、
`LOCK FOR <column>`句を実装しています。このクラスを拡張することで、`SKIP LOCKED`句のサポートも追加できます。

```java
import org.eclipse.persistence.internal.expressions.ExpressionSQLPrinter;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;
import org.eclipse.persistence.internal.expressions.SQLSelectStatement;
import org.eclipse.persistence.queries.ObjectBuildingQuery;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {
    public static final short LOCK_SKIP_LOCKED = Short.MAX_VALUE;

    private Integer waitTimeout;

    public OracleForUpdateOfClause() {
    }

    public OracleForUpdateOfClause(short lockMode) {
        setLockMode(lockMode);
    }

    public OracleForUpdateOfClause(Integer waitTimeout) {
        this.waitTimeout = waitTimeout;
        setLockMode(ObjectBuildingQuery.LOCK);
    }

    public void printSQL(ExpressionSQLPrinter printer, SQLSelectStatement statement) {
        super.printSQL(printer, statement);
        if (getLockMode() == ObjectBuildingQuery.LOCK && waitTimeout != null) {
            printer.printString(" WAIT " + waitTimeout);
        } else if (getLockMode() == LOCK_SKIP_LOCKED) {
            printer.printString(" SKIP LOCKED");
        }
    }
    
    //...
}
```

クエリの特定のリレーションから正しいフィールドを参照するには、クエリビルダーで準備された式を使用することをお勧めします。
これにより、結果のクエリの正しいテーブルエイリアスを見つける手間が省けます。
さて、最後のことは、クエリ実行前に句を追加することです。

```java
import org.eclipse.persistence.expressions.Expression;
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {
    
    //...

    public void selectQueryForUpdateOf(Query query) {
        ExpressionBuilder expressionBuilder = clone(query);
        getLockedExpressions().add(expressionBuilder);
    }

    public void selectQueryForUpdateOf(Query query, String ofRelation) {
        ExpressionBuilder expressionBuilder = clone(query);
        for (Expression expression : expressionBuilder.derivedExpressions) {
            if (ofRelation.equals(expression.getName())) {
                getLockedExpressions().add(expression);
                break;
            }
        }
    }

    //...
}
```

最後に、ロギングをオンにしてこの動作をテストすると、新しいロッキング句が表示されます。
これを、選択されたすべての行のロッキングと比較できます。

```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.LockModeType;
import javax.persistence.PersistenceException;
import javax.persistence.PersistenceUnit;
import javax.persistence.Query;
import java.util.function.Consumer;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class SelectForUpdateOfTest {

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;

    @Test
    public void testSelectForUpdate() {
        invokeInTransaction((entityManager) -> {
            entityManager.createQuery("SELECT s FROM Stock s JOIN FETCH s.product " +
                            "WHERE s.product.id = 1")
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getSingleResult();
            // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
            // FROM PRODUCT t0, STOCK t1
            // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id)) FOR UPDATE

            PersistenceException exception = Assertions.assertThrows(PersistenceException.class,
                    () -> invokeInTransaction((secondEntityManager) -> {
                Query query = secondEntityManager.createQuery("SELECT p FROM Product p " +
                        "WHERE p.id = 1");
                OracleForUpdateOfClause clause = new OracleForUpdateOfClause(5);
                clause.selectQueryForUpdateOf(query);
                query.getSingleResult();
                // SELECT ID, NAME FROM PRODUCT WHERE (ID = ?) FOR UPDATE OF ID WAIT 5
            }));

            assertThat(exception.getMessage(),
                    containsString("ORA-30006: resource busy; acquire with WAIT timeout expired"));
        });
    }

    private void invokeInTransaction(Consumer<EntityManager> transaction) {
        EntityManager em = entityManagerFactory.createEntityManager();
        em.getTransaction().begin();
        transaction.accept(em);
        em.getTransaction().commit();
    }
}
```

次に、同じ結合された結果に対して、1つのクエリで1つのテーブルの行をロックし、別のクエリで他のテーブルの行をロックすることが、競合なしでできます。
`SKIP LOCKED`部分も問題なく動作します。

```java
//...
@SpringBootTest
public class SelectForUpdateOfTest {

    //...

    @Test
    public void testSelectForUpdate_LockDifferentJoinedTables() {
        invokeInTransaction((entityManager) -> {
            Query query = entityManager.createQuery(
                    "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
            );
            OracleForUpdateOfClause clause = new OracleForUpdateOfClause(5);
            clause.selectQueryForUpdateOf(query, "product");
            query.getSingleResult();
            // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
            // FROM PRODUCT t0, STOCK t1
            // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id)) FOR UPDATE OF t0.ID WAIT 5

            invokeInTransaction((secondEntityManager) -> {
                Query secondQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause = new OracleForUpdateOfClause(5);
                secondClause.selectQueryForUpdateOf(secondQuery);
                secondQuery.getSingleResult();
                // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
                // FROM PRODUCT t0, STOCK t1
                // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
                // FOR UPDATE OF t1.ID WAIT 5
            });

            invokeInTransaction((secondEntityManager) -> {
                Query secondQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause =
                        new OracleForUpdateOfClause(OracleForUpdateOfClause.LOCK_SKIP_LOCKED);
                secondClause.selectQueryForUpdateOf(secondQuery, "product");
                assertTrue(secondQuery.getResultList().isEmpty());
                // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
                // FROM PRODUCT t0, STOCK t1
                // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
                // FOR UPDATE OF t0.ID SKIP LOCKED
            });
        });
    }

}

```


<img src="/img/hq/eclipselink-extended-locking-options.png" alt="EclipseLink SELECT FOR UPDATE OF / SKIP LOCKED" title="EclipseLink SELECT FOR UPDATE OF / SKIP LOCKED">

