---
title: Ampliando opciones de bloqueo con EclipseLink JPQL
url: eclipselink-extended-locking-options
id: 82
category:
  - jpa: JPA
  # "JPA" se mantiene como término estándar

tags:
  - sql
  - oracle
  - rendimiento
  - eclipselink
  # "performance" traducido como "rendimiento"
author: Damian Terlecki
date: 2022-03-20T20:00:00
---

La especificación JPA solo permite un subconjunto común de opciones de bloqueo de entidades, generalmente implementadas en la mayoría de las bases de datos. Cuando necesitas una opción de bloqueo más específica, tienes que recurrir a consultas nativas. Pero, ¿qué pasa si ya tienes código JPQL complejo? ¿No hay forma de emplear bloqueos específicos del proveedor?

EclipseLink implementa comportamientos específicos de base de datos en la clase *org<wbr>.eclipse<wbr>.persistence<wbr>.internal<wbr>.databaseaccess<wbr>.DatabasePlatform*. Dentro del paquete estándar encontrarás varias plataformas como MySQL, PostgreSQL, Oracle y muchas más. Cuando la construcción de la consulta requiere un comportamiento personalizado, el builder llama a la implementación de la plataforma. Siguiendo el stack trace, fácilmente encontrarás el punto y la interfaz usados para construir la parte de bloqueo de la consulta, que, como puedes imaginar, sigue variando entre bases de datos.

Veamos cómo maneja esto EclipseLink. Intentaremos ampliar el bloqueo con las cláusulas específicas de Oracle `SELECT FOR UPDATE OF` y `SKIP LOCKED`.

## JPQL SELECT FOR UPDATE OF / SKIP LOCKED

Para llegar a la implementación de la consulta, podemos desenvolverla en la interfaz interna. Todas las consultas de lectura con objetos en EclipseLink usan la clase *ObjectLevelReadQuery*. Sin embargo, ten en cuenta algo sobre los internos de EclipseLink antes de manipular la consulta subyacente: las consultas pueden compartirse. Para evitar efectos secundarios, clona la consulta de lectura y actualiza la referencia en el wrapper.

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

La interfaz de *ObjectLevelReadQuery* permite insertar la cláusula de bloqueo. Esta cláusula es una especie de builder que imprime la parte de bloqueo. Por defecto, aquí se usa *ForUpdateClause*, que soporta el bloqueo estándar, un timeout de espera y una cláusula no-wait.

Además, tenemos *ForUpdateOfClause*. Sin embargo, esta no soporta las cláusulas de espera y no-wait, pero implementa la cláusula `LOCK FOR <column>`. Extendiendo esta clase, puedes añadir soporte también para la cláusula `SKIP LOCKED`.

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

Para referenciar los campos correctos de una relación concreta de la consulta, recomiendo usar las expresiones preparadas en el query builder. Esto reduce el esfuerzo de averiguar el alias de tabla correcto en la consulta resultante. Lo último es añadir la cláusula antes de ejecutar la consulta.

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

Finalmente, si probamos este comportamiento con el logging activado, verás las nuevas cláusulas de bloqueo. Ahora puedes comparar esto con el bloqueo de todas las filas seleccionadas:

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

A continuación, para el mismo resultado con join, puedes bloquear las filas de una tabla en una consulta y las de la otra tabla en otra consulta sin contención.

La parte de `SKIP LOCKED` también funciona bien:

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
