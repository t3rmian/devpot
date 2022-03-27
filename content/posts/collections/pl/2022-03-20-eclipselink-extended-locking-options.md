---
title: Dodatkowe opcje blokowania wierszy w JPQL EclipseLink
url: eclipselink-dodatkowe-opcje-blokowanie-wierszy
id: 82
category:
  - jpa: JPA
tags:
  - sql
  - oracle
  - wydajność
author: Damian Terlecki
date: 2022-03-20T20:00:00
---

Specyfikacja JPA dopuszcza tylko wybrany podzbiór opcji blokowania encji.
W razie potrzeby bardziej specyficznego blokowania wierszy konieczne jest wykorzystanie zapytań natywnych.
Znając jednak kilka wewnętrznych interfejsów EclipseLink, możliwe jest dodanie takiego blokowania do kodu zapytania JPQL.

Implementacje zachowań specyficznych dla wybranych baz w EclipseLinku znajdziemy w klasach dziedziczących po
*org<wbr>.eclipse<wbr>.persistence<wbr>.internal<wbr>.databaseaccess<wbr>.DatabasePlatform*. W pakiecie mamy do wyboru kilka
platform, między innymi MySQL, PostgreSQL, Oracle. Za każdym razem, gdy tworzenie zapytań wymaga jakiegoś
niestandardowego zachowania, budowniczy zapytania wywołuje implementację platformy. Śledząc *stacktrace*, łatwo znajdziesz punkt i
interfejs użyty do zbudowania blokującej części zapytania, której struktura, jak możesz się spodziewać, nadal różni się pomiędzy bazami danych.

Zobaczmy, jak radzi sobie z tym EclipseLink. Spróbujemy rozszerzyć blokowanie o klauzule `SELECT FOR UPDATE OF` i `SKIP LOCKED` specyficzne dla
bazy danych Oracle.

## JPQL SELECT FOR UPDATE OF / SKIP LOCKED

Aby dostać się do implementacji zapytania, możemy rozpakować je do wewnętrznego interfejsu. Wszystkie zapytania odczytu
używające obiektów w EclipseLink używają klasy *ObjectLevelReadQuery*. Przed tym jednak zwróć uwagę na jedną rzecz dotyczącą
implementacji EclipseLink. Zapytania bywają wpółdzielone. Aby
zapobiec efektom ubocznym, musimy sklonować zapytanie i podmienić oryginalną referencję.


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

Interfejs *ObjectLevelReadQuery* umożliwia dodanie klauzuli blokującej. Klauzula ta jest rodzajem *buildera*, który 
zajmuje się zbudowaniem części zapytania.
Domyślnie używana jest tutaj klauzula *ForUpdateClause*. Ta implementacja
obsługuje standardowe blokowanie wierszy, limit czasu oczekiwania, jak również klauzulę *no-wait*.

Oprócz tego mamy też klasą *ForUpdateOfClause*. Ta jednak nie obsługuje klauzul *wait* i *no-wait*, ale implementuje klauzulę `LOCK
FOR <kolumna>`. Rozszerzając tę klasę, możemy dodać obsługę również dla klauzuli `SKIP LOCKED`.

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

Aby odwołać się do właściwych pól z danej relacji zapytania, proponuję skorzystać z wyrażeń przygotowanych w kreatorze zapytań.
Zmniejsza to wysiłek związany z odwołaniem do prawidłowego aliasu tabeli wynikowego zapytania.
Ostatnią rzeczą jest dodanie klauzuli przed wykonaniem zapytania.

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

Na koniec, włączamy logowanie zapytań (`<property name="eclipselink.logging.level" value="FINEST"/>` w *persistence.xml*) i testujemy.
Po pierwsze sprawdzamy blokowanie dwóch jednoczesnych zapytań:

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
                Query parQuery = secondEntityManager.createQuery("SELECT p FROM Product p " +
                        "WHERE p.id = 1");
                OracleForUpdateOfClause clause = new OracleForUpdateOfClause(5);
                clause.selectQueryForUpdateOf(parQuery);
                parQuery.getSingleResult();
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

Następnie dla tego samego połączonego wyniku blokujemy wiersze z jednej tabeli w jednym zapytaniu i wiersze z drugiej tabeli w innym zapytaniu.
W części `SKIP LOCKED` encja jest poprawnie pomijana.

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
            // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
            // FOR UPDATE OF t0.ID WAIT 5

            invokeInTransaction((secondEntityManager) -> {
                Query parQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause = new OracleForUpdateOfClause(5);
                secondClause.selectQueryForUpdateOf(parQuery);
                parQuery.getSingleResult();
                // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
                // FROM PRODUCT t0, STOCK t1
                // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
                // FOR UPDATE OF t1.ID WAIT 5
            });

            invokeInTransaction((secondEntityManager) -> {
                Query parQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause =
                        new OracleForUpdateOfClause(OracleForUpdateOfClause.LOCK_SKIP_LOCKED);
                secondClause.selectQueryForUpdateOf(parQuery, "product");
                assertTrue(parQuery.getResultList().isEmpty());
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
