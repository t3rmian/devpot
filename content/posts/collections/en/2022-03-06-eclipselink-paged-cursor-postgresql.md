---
title: PostgreSQL cursor fetch size (EclipeLink JPA)
url: eclipselink-jpa-cursor-fetch-postgresql
id: 81
tags:
  - java
  - database
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

Cursor is a convenient method for managing the amount of memory used by a result set at any given time. In the
case of the JDBC driver for PostgreSQL, [additional requirements](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note)
must be met so that the entire data set is not fetched
despite the defined paging size. If we ignore it, our application may take a few GB of data more than we intended.

## Cursor result set

The most important conditions are that the cursor must be configured as TYPE_FORWARD_ONLY and the connection must not be in the auto-commit mode.
Considering the JDBC interface itself, there are no problems with fulfilling these requirements, but in the case of JPA, it is more complicated.
Let's see what can happen when using EclipseLink.

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

To get a typical cursor for a JPA query, I use the RESULT_SET_TYPE, SCROLLABLE_CURSOR, MAINTAIN_CACHE, and
JDBC_FETCH_SIZE hints. Thanks to them, EclipseLink will build the query result as a paged cursor. At this point, we can simply cast
the result onto the Iterator, but for the purpose of testing the internal state of the cursor, I will use the
EclipseLink-specific cursor interface.

## Cursor fetch size verification

In such a constructed query, we have no way to configure the `autocommit` property. The JPA specification does not define
such an interface. This parameter value will be controlled depending on the demarcation and transaction type (RESOURCE_LOCAL or JTA).
For example, we may be surprised that for a read-only transaction our cursor will fetch the entire data set:

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

Only after the actual start of the transaction will we get the expected cursor size. This moment may differ depending on
the transaction manager. By default, in Spring, this will be during the first modification operation. If we attach the
*EclipseLinkJpaDialect* configuration with the `lazyDatabaseTransaction` flag set to `false`, then any query in a mode other
than read-only will initiate the transaction.

In the absence of a manager, the proper start can be enforced through the `beginEarlyTransaction()`.

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

Next, in the case of JEE transactions, the JCA specification (JBoss / WildFly JDBC) ensures that auto-commit mode
is turned off at the very beginning of the transaction (for the transactional data source). In the context of a JEE
transaction with the `TransactionAttributeType.NEVER` attribute, we will not initiate a JPA transaction or obtain a
connection using the `unwrap()` method. We can try to intercept the connection by listening for EclipseLink session
events, although modifying the attributes will not conform to the EJB 3 specification.

## Modification of connection parameters

Considering the above specifications, I would advise against breaking the convention. Let's try to meet the conditions of the
controller in accordance with the technologies used. However, in the absence of such restrictions, would we be able to
add support for such a use case at a relatively low cost? The answer to this question will certainly be the EclipseLink
*SessionEventListener* interface.

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

The `preExecuteCall()` (#1) method is the moment when EclipseLink 2.7+ has already initialized the list of accessors (#3a)
through which the database connection is made (#3b). Here we can check what kind of query will be executed in a moment (#2).

Dealing with a forward cursor query, we increment the connection count (#4). In the case of an external connection pool 
(e.g. JNDI), this is where the SQL connection is retrieved (if not enforced, usually shortly after). Connections from the
internal pool are initialized before calling the *preExecuteCall*.

Then we disable the `autocommit` (#5) and mark the accessor as modified (#6) so that later we can restore the previous
property of the connection (#7). Eventually, before returning to the pool, e.g. when closing the cursor, the [shared locks](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database)
are released. In case of an unexpected error, we invalidate the accessor (#9), informing EclipseLink to close the connection.

Now we can apply our configuration in the `persistence.xml` file:

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

Alternatively, the configuration can be temporarily added to a shared server session:

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

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="EclipseLink paged PostgreSQL cursor" title="EclipseLink paged PostgreSQL cursor">
