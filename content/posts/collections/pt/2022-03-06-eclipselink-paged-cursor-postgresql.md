---
title: Tamanho do fetch de cursor no PostgreSQL (EclipseLink JPA)
url: eclipselink-jpa-fetch-cursor-postgresql
id: 81
category:
- jpa: JPA
tags:
- sql
- postgresql
- desempenho
- eclipselink
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

O cursor é um método conveniente para gerenciar a quantidade de memória usada por um conjunto de resultados em qualquer momento. No
caso do driver JDBC para PostgreSQL, [requisitos adicionais](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note)
devem ser atendidos para que o conjunto de dados inteiro não seja buscado, apesar do tamanho de paginação definido. Se ignorarmos isso, nossa aplicação pode consumir alguns GB de dados a mais do que pretendíamos.

## Conjunto de resultados do cursor

As condições mais importantes são que o cursor deve ser configurado como TYPE_FORWARD_ONLY e a conexão não deve estar no modo de auto-commit.
Considerando a própria interface JDBC, não há problemas em atender a esses requisitos, mas no caso do JPA, é mais complicado.
Vamos ver o que pode acontecer ao usar o EclipseLink.

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

Para obter um cursor típico para uma query JPA, eu uso as hints RESULT_SET_TYPE, SCROLLABLE_CURSOR, MAINTAIN_CACHE e
JDBC_FETCH_SIZE. Graças a elas, o EclipseLink construirá o resultado da query como um cursor paginado. Neste ponto, podemos simplesmente converter
o resultado para o Iterator, mas para o propósito de testar o estado interno do cursor, usarei a
interface de cursor específica do EclipseLink.

## Verificação do tamanho do fetch do cursor

Em uma query construída dessa forma, não temos como configurar a propriedade `autocommit`. A especificação JPA não define
tal interface. O valor desse parâmetro será controlado dependendo da demarcação e do tipo de transação (RESOURCE_LOCAL ou JTA).
Por exemplo, podemos nos surpreender que, para uma transação somente de leitura, nosso cursor buscará o conjunto de dados inteiro:

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

Somente após o início real da transação, obteremos o tamanho esperado do cursor. Esse momento pode variar dependendo do
gerenciador de transações. Por padrão, no Spring, isso ocorrerá durante a primeira operação de modificação. Se anexarmos a
configuração *EclipseLinkJpaDialect* com a flag `lazyDatabaseTransaction` definida como `false`, qualquer query em um modo diferente de somente leitura iniciará a transação.

Na ausência de um gerenciador, o início adequado pode ser forçado através do `beginEarlyTransaction()`.

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

Em seguida, no caso de transações JEE, a especificação JCA (JBoss / WildFly JDBC) garante que o modo de auto-commit
seja desativado no início da transação (para a fonte de dados transacional). No contexto de uma transação JEE
com o atributo `TransactionAttributeType.NEVER`, não iniciaremos uma transação JPA nem obteremos uma
conexão usando o método `unwrap()`. Podemos tentar interceptar a conexão ouvindo eventos de sessão do EclipseLink,
embora a modificação dos atributos não esteja em conformidade com a especificação EJB 3.

## Modificação dos parâmetros de conexão

Considerando as especificações acima, eu desaconselharia quebrar a convenção. Vamos tentar atender às condições do
controlador de acordo com as tecnologias usadas. No entanto, na ausência de tais restrições, seríamos capazes de
adicionar suporte para tal caso de uso a um custo relativamente baixo? A resposta para esta pergunta certamente será a interface
*SessionEventListener* do EclipseLink.

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

O método `preExecuteCall()` (#1) é o momento em que o EclipseLink 2.7+ já inicializou a lista de acessadores (#3a)
através dos quais a conexão com o banco de dados é feita (#3b). Aqui podemos verificar que tipo de query será executada em um momento (#2).

Lidando com uma query de cursor do tipo forward, incrementamos a contagem de conexões (#4). No caso de um pool de conexões externo
(por exemplo, JNDI), é aqui que a conexão SQL é recuperada (se não forçada, geralmente logo após). Conexões do
pool interno são inicializadas antes de chamar o *preExecuteCall*.

Então, desativamos o `autocommit` (#5) e marcamos o acessador como modificado (#6) para que mais tarde possamos restaurar a propriedade anterior da conexão (#7). Eventualmente, antes de retornar ao pool, por exemplo, ao fechar o cursor, os [bloqueios compartilhados](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database)
são liberados. Em caso de um erro inesperado, invalidamos o acessador (#9), informando ao EclipseLink para fechar a conexão.

Agora podemos aplicar nossa configuração no arquivo `persistence.xml`:

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

Alternativamente, a configuração pode ser adicionada temporariamente a uma sessão de servidor compartilhada:

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

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="Cursor paginado do PostgreSQL no EclipseLink" title="Cursor paginado do PostgreSQL no EclipseLink">
