---
title: Estendendo opções de bloqueio com JPQL do EclipseLink
url: eclipselink-opcoes-de-bloqueio-estendidas
id: 82
category:
- jpa: JPA
tags:
- sql
- oracle
- desempenho
- eclipselink
author: Damian Terlecki
date: 2022-03-20T20:00:00
---

A especificação JPA permite apenas um subconjunto comum de opções de bloqueio de entidades geralmente implementadas nos bancos de dados. Quando confrontado com a necessidade de escolher uma opção de bloqueio mais específica, você precisa recorrer a queries nativas. Mas quando você já tem um código JPQL complexo, não há como empregar um bloqueio específico do fornecedor?

O EclipseLink implementa o comportamento específico do banco de dados sob a classe *org<wbr>.eclipse<wbr>.persistence<wbr>.internal<wbr>.databaseaccess<wbr>.DatabasePlatform*. Dentro do pacote padrão, você encontrará várias plataformas diferentes como MySQL, PostgreSQL, Oracle e muitas outras. Sempre que a construção da query requer algum comportamento personalizado, o construtor chama a implementação da plataforma. Seguindo o rastreamento da pilha, você encontrará facilmente o ponto e a interface usada para construir a parte de bloqueio da query que, como você pode esperar, ainda difere entre os bancos de dados.

Vamos ver como o EclipseLink lida com isso. Tentaremos estender o bloqueio com as cláusulas específicas do Oracle `SELECT FOR UPDATE OF` e `SKIP LOCKED`.

## JPQL SELECT FOR UPDATE OF / SKIP LOCKED

Para entrar na implementação da query, podemos desempacotá-la para a interface interna. Todas as queries de leitura usando objetos no EclipseLink usam a classe *ObjectLevelReadQuery*. No entanto, observe uma coisa sobre os componentes internos do EclipseLink antes de começar a mexer na query subjacente. As queries podem ser compartilhadas. Para evitar efeitos colaterais, clone a query de leitura e atualize a referência no wrapper.

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

A interface de *ObjectLevelReadQuery* fornece uma maneira de inserir a cláusula de bloqueio. Esta cláusula é uma espécie de interface construtora que imprime a parte do bloqueio. Por padrão, a *ForUpdateClause* é usada aqui. Esta implementação suporta o bloqueio padrão, um tempo de espera (timeout) e uma cláusula de não espera (no-wait).

Além disso, temos a *ForUpdateOfClause*. Esta, no entanto, não suporta as cláusulas de espera e não espera, mas implementa a cláusula `LOCK FOR <coluna>`. Ao estender esta classe, você pode adicionar suporte também para a cláusula `SKIP LOCKED`.

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

Para referenciar os campos corretos de um relacionamento específico da query, sugiro usar as expressões preparadas no construtor da query. Isso reduz o esforço de descobrir o alias de tabela correto para a query resultante. Agora a última coisa é adicionar a cláusula antes da execução da query.

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

Finalmente, se testarmos este comportamento com o logging ativado, você verá as novas cláusulas de bloqueio. Agora você pode comparar isso com o bloqueio de todas as linhas selecionadas:

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

Em seguida, para o mesmo resultado com junção, você pode bloquear as linhas de uma tabela em uma query e as linhas da outra tabela em outra query sem qualquer contenção. A parte `SKIP LOCKED` também funciona bem:

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
