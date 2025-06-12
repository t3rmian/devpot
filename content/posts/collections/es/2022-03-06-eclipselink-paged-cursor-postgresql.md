---
title: Tamaño de fetch de cursor en PostgreSQL (EclipseLink JPA)
url: eclipselink-jpa-cursor-fetch-postgresql
id: 81
category:
  - jpa: JPA
  # "JPA" se mantiene como término estándar

tags:
  - sql
  - postgresql
  - rendimiento
  - eclipselink
  # "performance" traducido como "rendimiento"
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

El cursor es un método conveniente para gestionar la cantidad de memoria utilizada por un result set en cada momento. En el caso del driver JDBC para PostgreSQL, hay [requisitos adicionales](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note) que deben cumplirse para que no se recupere todo el conjunto de datos a pesar del tamaño de paginación definido. Si los ignoramos, nuestra aplicación puede consumir varios GB de datos más de lo previsto.

## Result set con cursor

Las condiciones más importantes son que el cursor debe estar configurado como TYPE_FORWARD_ONLY y la conexión no debe estar en modo auto-commit. Considerando la interfaz JDBC en sí, no hay problemas para cumplir estos requisitos, pero en el caso de JPA, es más complicado. Veamos qué puede ocurrir usando EclipseLink.

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

Para obtener un cursor típico en una consulta JPA, uso los hints RESULT_SET_TYPE, SCROLLABLE_CURSOR, MAINTAIN_CACHE y JDBC_FETCH_SIZE. Gracias a ellos, EclipseLink construirá el resultado como un cursor paginado. En este punto, podemos hacer un cast a Iterator, pero para probar el estado interno del cursor, usaré la interfaz específica de EclipseLink.

## Verificación del tamaño de fetch del cursor

En una consulta construida así, no tenemos forma de configurar la propiedad `autocommit`. La especificación JPA no define tal interfaz. Este parámetro será controlado según la demarcación y el tipo de transacción (RESOURCE_LOCAL o JTA). Por ejemplo, puede sorprendernos que para una transacción de solo lectura nuestro cursor recupere todo el conjunto de datos:

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

Solo después de iniciar realmente la transacción obtendremos el tamaño de cursor esperado. Este momento puede variar según el gestor de transacciones. Por defecto, en Spring, será durante la primera operación de modificación. Si añadimos la configuración *EclipseLinkJpaDialect* con el flag `lazyDatabaseTransaction` en `false`, cualquier consulta en modo distinto de solo lectura iniciará la transacción.

En ausencia de un gestor, el inicio adecuado puede forzarse mediante `beginEarlyTransaction()`.

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

En el caso de transacciones JEE, la especificación JCA (JBoss / WildFly JDBC) asegura que el modo auto-commit se desactive al inicio de la transacción (para el data source transaccional). En el contexto de una transacción JEE con el atributo `TransactionAttributeType.NEVER`, no iniciaremos una transacción JPA ni obtendremos una conexión usando `unwrap()`. Podemos intentar interceptar la conexión escuchando eventos de sesión de EclipseLink, aunque modificar los atributos no se ajusta a la especificación EJB 3.

## Modificación de parámetros de conexión

Teniendo en cuenta lo anterior, recomiendo no romper la convención. Intentemos cumplir las condiciones del controlador según las tecnologías usadas. Sin embargo, en ausencia de tales restricciones, ¿seríamos capaces de añadir soporte para este caso de uso a bajo coste? La respuesta es la interfaz *SessionEventListener* de EclipseLink.

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

El método `preExecuteCall()` (#1) es el momento en que EclipseLink 2.7+ ya ha inicializado la lista de accessors (#3a) a través de los cuales se realiza la conexión a la base de datos (#3b). Aquí podemos comprobar qué tipo de consulta se va a ejecutar en breve (#2).

Si se trata de una consulta con cursor forward, incrementamos el contador de conexiones (#4). En el caso de un pool de conexiones externo (por ejemplo, JNDI), aquí es donde se recupera la conexión SQL (si no se fuerza, normalmente poco después). Las conexiones del pool interno se inicializan antes de llamar a *preExecuteCall*.

Luego desactivamos el `autocommit` (#5) y marcamos el accessor como modificado (#6) para que después podamos restaurar la propiedad anterior de la conexión (#7). Finalmente, antes de devolverla al pool, por ejemplo al cerrar el cursor, se liberan los [shared locks](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database). En caso de error inesperado, invalidamos el accessor (#9), informando a EclipseLink para que cierre la conexión.

Ahora podemos aplicar nuestra configuración en el archivo `persistence.xml`:

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

Alternativamente, la configuración puede añadirse temporalmente a una sesión de servidor compartida:

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

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="Cursor paginado de EclipseLink en PostgreSQL" title="Cursor paginado de EclipseLink en PostgreSQL">
