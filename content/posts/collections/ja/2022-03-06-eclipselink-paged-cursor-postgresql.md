---
title: PostgreSQLのカーソルフェッチサイズ (EclipseLink JPA)
url: eclipselink-jpa-カーソル-フェッチ-postgresql
id: 81
category:
- jpa: JPA
tags:
- sql
- postgresql
- パフォーマンス
- eclipselink
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

カーソルは、特定の時点での結果セットが使用するメモリ量を管理するための便利な方法です。
PostgreSQL用のJDBCドライバの場合、[追加の要件](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note)
を満たさないと、ページングサイズが定義されているにもかかわらず、データセット全体がフェッチされてしまいます。
これを無視すると、アプリケーションが意図したよりも数GB多くのデータを消費する可能性があります。

## カーソル結果セット

最も重要な条件は、カーソルがTYPE_FORWARD_ONLYとして設定され、接続が自動コミットモードでないことです。
JDBCインターフェース自体を考えると、これらの要件を満たすことに問題はありませんが、JPAの場合はより複雑になります。
EclipseLinkを使用すると何が起こるか見てみましょう。

```java
import org.eclipse.persistence.config.HintValues;
import org.eclipse.persistence.config.QueryHints;
import org.eclipse.persistence.config.ResultSetType;
import org.eclipse.persistence.queries.Cursor;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.PersistenceContext;
import javax.persistence.PersistenceUnit;
import javax.persistence.Query;

public class ForwardCursorTest {
    @PersistenceContext
    private EntityManager entityManager;

    private Cursor getInternalPgResultSet() {
        Query usersQuery = entityManager.createQuery("SELECT u from User u")
                .setHint(QueryHints.RESULT_SET_TYPE, ResultSetType.ForwardOnly)
                .setHint(QueryHints.SCROLLABLE_CURSOR, HintValues.TRUE)
                .setHint(QueryHints.MAINTAIN_CACHE, HintValues.FALSE)
                .setHint(QueryHints.JDBC_FETCH_SIZE, FETCH_SIZE);

        return (Cursor) usersQuery.getSingleResult();
    }
}
```

JPAクエリの典型的なカーソルを取得するために、RESULT_SET_TYPE、SCROLLABLE_CURSOR、MAINTAIN_CACHE、および
JDBC_FETCH_SIZEヒントを使用します。これらのおかげで、EclipseLinkはページングされたカーソルとしてクエリ結果を構築します。この時点で、
結果をIteratorにキャストするだけで済みますが、カーソルの内部状態をテストする目的で、
EclipseLink固有のカーソルインターフェースを使用します。

## カーソルフェッチサイズの検証

このように構築されたクエリでは、`autocommit`プロパティを設定する方法がありません。JPA仕様はそのような
インターフェースを定義していません。このパラメータ値は、境界設定とトランザクションタイプ（RESOURCE_LOCALまたはJTA）に応じて制御されます。
例えば、読み取り専用トランザクションの場合、カーソルがデータセット全体をフェッチするという驚きに遭遇するかもしれません。

```java
import org.eclipse.persistence.queries.Cursor;
import org.junit.jupiter.api.Test;
import org.postgresql.jdbc.PgResultSet;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

@SpringBootTest
public class ForwardCursorTest {

    private static final int FETCH_SIZE = 1;

    private interface Function<T, R, E extends Throwable> {
        R apply(T t) throws E;
    }
    
    private static int getConsuming(
            Cursor cursor,
            Function<PgResultSet, Integer, SQLException> getter
    ) throws SQLException {
        PgResultSet resultSet = cursor.getResultSet().unwrap(PgResultSet.class);
        Integer result = getter.apply(resultSet);
        cursor.close();
        return result;
    }

    //...

    @Test
    @Transactional(readOnly = true)
    public void testForwardCursorFetchSize_NonTransactional_ReadOnly() throws SQLException {
        Cursor cursor = getInternalPgResultSet();
        long fetchSize = getConsuming(cursor, PgResultSet::getLastUsedFetchSize);
        assertNotEquals(FETCH_SIZE, fetchSize);
        assertEquals(
                entityManager.createQuery("SELECT COUNT(u) FROM User u").getSingleResult(),
                fetchSize
        );
    }

    @Test
    public void testForwardCursorFetchSize_NonTransactional() throws SQLException {
        Cursor cursor = getInternalPgResultSet();
        assertNotEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
    }
}
```

トランザクションが実際に開始された後にのみ、期待されるカーソルサイズが得られます。このタイミングは
トランザクションマネージャによって異なる場合があります。デフォルトでは、Springでは最初の変更操作中にこれが発生します。
`lazyDatabaseTransaction`フラグを`false`に設定した*EclipseLinkJpaDialect*設定をアタッチすると、
読み取り専用以外のモードのクエリはトランザクションを開始します。

マネージャーが不在の場合、`beginEarlyTransaction()`を介して適切な開始を強制できます。

```java
import javax.persistence.EntityManagerFactory;

@SpringBootTest
public class ForwardCursorTest {

    //...

    @Test
    @Transactional
    public void testForwardCursorFetchSize_Transactional() throws SQLException {
        entityManager.createNativeQuery("set application_name to 'Implicit autocommit disable';")
                .executeUpdate();
        Cursor cursor = getInternalPgResultSet();
        assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
    }

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;
    
    @Test
    public void testForwardCursorFetchSize_Transactional_NonManaged() throws SQLException {
        entityManager = entityManagerFactory.createEntityManager();
        entityManager.getTransaction().begin();
        entityManager.unwrap(UnitOfWork.class).beginEarlyTransaction();
        Cursor cursor = getInternalPgResultSet();
        assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
        entityManager.getTransaction().rollback();
    }
}
```

次に、JEEトランザクションの場合、JCA仕様（JBoss / WildFly JDBC）は、トランザクションの最初に自動コミットモードが
オフになることを保証します（トランザクションデータソースの場合）。`TransactionAttributeType.NEVER`属性を持つJEEトランザクションの
コンテキストでは、JPAトランザクションを開始したり、`unwrap()`メソッドを使用して接続を取得したりすることはありません。
EclipseLinkセッションイベントをリッスンして接続をインターセプトしようと試みることはできますが、属性を変更することはEJB 3仕様に準拠しません。

## 接続パラメータの変更

上記の仕様を考慮すると、規約を破ることはお勧めしません。使用されている技術に従って
コントローラの条件を満たすようにしましょう。しかし、そのような制限がない場合、
比較的低コストでそのようなユースケースのサポートを追加できるでしょうか？この質問に対する答えは、確かにEclipseLinkの
*SessionEventListener*インターフェースです。

```java
package dev.termian.demo;

import org.eclipse.persistence.config.QueryHints;
import org.eclipse.persistence.config.ResultSetType;
import org.eclipse.persistence.internal.databaseaccess.Accessor;
import org.eclipse.persistence.internal.databaseaccess.DatasourceCall;
import org.eclipse.persistence.internal.jpa.QueryHintsHandler;
import org.eclipse.persistence.internal.sessions.AbstractSession;
import org.eclipse.persistence.queries.DatabaseQuery;
import org.eclipse.persistence.sessions.SessionEvent;
import org.eclipse.persistence.sessions.SessionEventAdapter;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class CursorQueryAutocommitDisabler extends SessionEventAdapter {

    private final Set<Accessor> modifiedAccessors = 
            Collections.newSetFromMap(new ConcurrentHashMap<>());

    @Override
    public void preExecuteCall(SessionEvent event) { // #1
        super.preExecuteCall(event);
        DatabaseQuery query = getForwardCursorQuery(event);
        if (query != null) {
            disableAutocommit(query, query.getSession());
        }
    }

    private void disableAutocommit(DatabaseQuery query, AbstractSession session) {
        for (Accessor accessor : query.getAccessors()) { // #3a
            accessor.incrementCallCount(session); // #5
            Connection connection = accessor.getConnection(); // #3b
            try {
                if (connection.getAutoCommit()) {
                    connection.setAutoCommit(false); // #6
                    modifiedAccessors.add(accessor); // #7
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    @Override
    public void postExecuteCall(SessionEvent event) {
        super.preExecuteCall(event);
        DatabaseQuery query = getForwardCursorQuery(event);
        if (query != null) {
            for (Accessor accessor : query.getAccessors()) {
                accessor.decrementCallCount();
            }
        }
    }

    private DatabaseQuery getForwardCursorQuery(SessionEvent event) { 
        if (!(event.getCall() instanceof DatasourceCall)) {
            return null;
        }
        DatasourceCall call = (DatasourceCall) event.getCall();
        if (call.getQuery() == null) {
            return null;
        }
        DatabaseQuery query = call.getQuery(); // #2

        //noinspection unchecked 
        Map<String, Object> hints = (Map<String, Object>) query
                .getProperty(QueryHintsHandler.QUERY_HINT_PROPERTY);
        if (hints == null || // #4
                !ResultSetType.ForwardOnly.equals(hints.get(QueryHints.RESULT_SET_TYPE))) {
            return null;
        }
        return query;
    }

    @Override
    public void preReleaseConnection(SessionEvent event) {
        super.preReleaseConnection(event);
        Accessor accessor = (Accessor) event.getResult();
        if (modifiedAccessors.remove(accessor)) {
            Connection connection = accessor.getConnection();
            try {
                connection.rollback();
                connection.setAutoCommit(true); // #8
            } catch (SQLException e) {
                accessor.setIsValid(false); // #9
            }
        }
    }
}
```

`preExecuteCall()`(#1)メソッドは、EclipseLink 2.7+がデータベース接続を行うためのアクセサのリスト(#3a)をすでに初期化している時点です(#3b)。
ここで、これから実行されるクエリの種類を確認できます(#2)。

フォワードカーソルクエリを扱う場合、接続カウントをインクリメントします(#4)。外部接続プール
（例：JNDI）の場合、ここでSQL接続が取得されます（強制されない場合、通常は直後）。
内部プールの接続は、*preExecuteCall*を呼び出す前に初期化されます。

次に、`autocommit`を無効にし(#5)、後で接続の以前のプロパティを復元できるようにアクセサを修正済みとしてマークします(#6)。
最終的に、プールに戻る前、例えばカーソルを閉じるときに、[共有ロック](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database)
が解放されます。予期せぬエラーが発生した場合、アクセサを無効にし(#9)、EclipseLinkに接続を閉じるよう通知します。

これで、`persistence.xml`ファイルで設定を適用できます。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<persistence version="2.1" xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence 
             http://xmlns.jcp.org/xml/ns/persistence/persistence_2_1.xsd">
    <persistence-unit name="my-pu">
        <!--...-->
        <properties>
            <!--...-->
            <property name="eclipselink.session-event-listener"
                      value="dev.termian.demo.CursorQueryAutocommitDisabler"/>
        </properties>
    </persistence-unit>
</persistence>
```

あるいは、共有サーバーセッションに一時的に設定を追加することもできます。

```java
import org.eclipse.persistence.sessions.SessionEventManager;
import org.eclipse.persistence.sessions.server.ServerSession;

public class ForwardCursorTest {
    //...
    @Test
    public void testForwardCursorFetchSize_NonTransactional_AutocommitDisabled()
            throws SQLException {
        SessionEventManager eventManager = entityManagerFactory.createEntityManager()
                .unwrap(ServerSession.class).getEventManager();
        CursorQueryAutocommitDisabler queryListener = new CursorQueryAutocommitDisabler();
        eventManager.addListener(queryListener);

        try {
            Cursor cursor = getInternalPgResultSet();
            assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
        } finally { // ServerSession is shared by entity managers of the same factory
            eventManager.removeListener(queryListener);
        }

        Cursor cursorOnReusedConnection = getInternalPgResultSet();
        assertNotEquals(FETCH_SIZE,
                getConsuming(cursorOnReusedConnection, PgResultSet::getLastUsedFetchSize)
        );
    }
}
```

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="EclipseLink ページングされたPostgreSQLカーソル" title="EclipseLink ページングされたPostgreSQLカーソル">

