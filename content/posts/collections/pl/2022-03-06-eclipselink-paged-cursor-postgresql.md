---
title: Rozmiar strony kursora PostgreSQL (EclipeLink JPA)
url: eclipselink-jpa-rozmiar-kursora-postgresql
id: 81
category:
  - jpa: JPA
tags:
  - sql
  - postgresql
  - wydajność
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

Dostęp do danych bazy za pomocą kursora to wygodna metoda pozwalająca na zarządzanie rozmiarami pamięci wykorzystywanej 
przez zestaw wyników w danym momencie. W przypadku sterownika JDBC dla PostgreSQL
[dodatkowe warunki](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note)
muszą być spełnione, aby pomimo zdefiniowanego rozmiaru stronicowania nie został zaciągnięty cały zbiór danych.
Jeśli je pominiemy, nasza aplikacja może zaciągnąć kilka GB danych więcej, niż zamierzaliśmy.

## Utworzenie kursora

Do najważniejszych wymagań należy to, że kursor musi być skonfigurowany jako TYPE_FORWARD_ONLY, a połączenie nie może odbywać się w trybie *autocommit*.
O ile do czynienia mamy z samym interfejsem JDBC nie ma problemów ze spełnieniem postawionych warunków, o tyle w przypadku JPA sprawa się komplikuje.
Zobaczmy, jaki może mieć to wpływ przy wykorzystaniu EclipeLinka.

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

Do pozyskania typowego kursora posłużę się wskazówkami RESULT_SET_TYPE, SCROLLABLE_CURSOR, MAINTAIN_CACHE oraz JDBC_FETCH_SIZE.
Dzięki nim EclipseLink zbuduje rezultat zapytania jako kursor. W tym miejscu możemy zrzutować wynik po prostu na *Iterator*,
jednak dla potrzeby testu wewnętrznego stanu kursora skorzystam z interfejsu właściwego dla EclipseLinka.

## Weryfikacja rozmiaru kursora

W tak zbudowanym zapytaniu brakuje nam konfiguracji właściwości `autocommit`. Specyfikacja JPA nie definiuje takiego interfejsu.
Wartość tego parametru będzie sterowana zależnie od demarkacji oraz typu transakcji (RESOURCE_LOCAL lub JTA). Przykładowo
możemy się zdziwić, że dla transakcji typu *read-only* nasz kursor zaciągnie cały zbiór danych:

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

Dopiero po faktycznym rozpoczęciu transakcji uzyskamy oczekiwany rozmiar kursora. Moment ten może różnić się w zależności od
zarządcy transakcji. Standardowo w Springu, będzie to w trakcie pierwszej operacji modyfikującej. Jeśli podepniemy konfigurację *EclipseLinkJpaDialect*
z flagą `lazyDatabaseTransaction` ustawioną na `false` to każde zapytanie w trybie innym niż *read-only* zainicjalizuje transakcję.

W przypadku braku zarządcy właściwe rozpoczęcie można wymusić poprzez `beginEarlyTransaction()`.

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

Dalej, w przypadku transakcji JEE specyfikacja JCA (JBoss/WildFly JDBC) zapewnia wyłączeniu trybu *auto-commit* już na samym początku transakcji (dla transakcyjnego źródła danych).
W kontekście transakcji JEE z atrybutem `TransactionAttributeType.NEVER` nie rozpoczniemy transakcji JPA ani nie uzyskamy połączenia przy pomocy metody `unwrap()`.
Możemy próbować przechwycić połączenie, nasłuchując zdarzeń sesyjnych EclipseLink, chociaż modyfikacja atrybutów nie będzie zgodna ze specyfikacją EJB 3.

## Modyfikacja parametrów połączenia

Biorąc pod uwagę powyższe kwestie, odradzałbym łamanie konwencji. Postarajmy się spełnić [warunki sterownika](https://github.com/pgjdbc/pgjdbc/blob/REL42.3.3/pgjdbc/src/main/java/org/postgresql/jdbc/PgStatement.java#L429)
w zgodzie z wykorzystywanymi technologiami. Czy jednak w przypadku braku takich ograniczeń bylibyśmy w stanie niewielkim kosztem dodać wsparcie dla takiego przypadku
użycia? Odpowiedzią na to pytanie będzie z pewnością interfejs EclipseLink *SessionEventListener*.

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

Metoda `preExecuteCall()` (#1) to moment, w którym EclipseLink 2.7+ zainicjalizował już listę akcesorów (#3a), za pomocą których realizowane jest połączenie do bazy danych (#3b).
W tym miejscu możemy sprawdzić jakiego rodzaju zapytanie zostanie za chwilę wywołane (#2).

Jeśli mamy do czynienia z kursorem typu forward to inkrementujemy licznik połączeń (#4).
W przypadku zewnętrznej puli połączeń (np. JNDI) w tym miejscu następuje pobranie połączenia SQL (zazwyczaj odbywa się to chwilę później).
Połączenia z puli wewnętrznej inicjalizowane są natomiast przed wywołaniem *preExecuteCall*.

Następnie wyłączamy `autocommit` (#5) i zapisujemy akcesor jako zmodyfikowany (#6), aby później przywrócić poprzednią wartość połączenia (#7).
Ostatecznie przed powrotem do puli, np. przy zamykaniu kursora, [współdzielone blokady](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database)
zostają zwolnione. W przypadku niespodziewanego błędu unieważniamy akcesor (#9), informując EclipseLink o konieczności zamknięcia połączenia.

Teraz naszą konfigurację możemy podpiąć w pliku `persistence.xml`:

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

Ewentualnie konfigurację możemy tymczasowo dodać do współdzielonej sesji serwerowej:

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

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="EclipseLink kursor PostgreSQL ze stronicowaniem" title="EclipseLink kursor PostgreSQL ze stronicowaniem">
