---
title: SQL Nativo no CriteriaBuilder do JPA (EclipseLink)
url: jpa-criteriabuilder-sql-nativo-eclipselink
id: 64
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
    author: Damian Terlecki
    date: 2021-04-18T20:00:00
---

Ao usar o JPA CriteriaBuilder, mais cedo ou mais tarde você encontrará algumas limitações que resultam da especificação. Um exemplo disso pode ser a limitação do número máximo de resultados retornados em uma subconsulta, ou a alteração da ordem de classificação dos valores NULL. O EclipseLink, como alternativa ao Hibernate, oferece uma abstração bastante interessante na forma da interface *JpaCriteriaBuilder* e da classe *ExpressionBuilder*.

## Query TOP N

A query TOP N é uma consulta padrão na qual queremos recuperar N registros do banco de dados, na maioria das vezes ordenados por algum atributo de nosso interesse. Por exemplo, podemos querer descobrir os 5 produtos mais bem avaliados (sintaxe do banco de dados H2):

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 5;
```

Podemos construir facilmente tal consulta usando a classe *CriteriaBuilder* (na verdade, através de `CriteriaQuery.orderBy()` e `Query.setMaxResults()`), para a qual obtemos uma referência do *EntityManager*. Caso queiramos colocá-los como uma subconsulta, a questão se torna mais complicada.

A versão atual do JPA 2.2 não nos fornece tal possibilidade. Podemos, é claro, dividir nosso problema em duas consultas ou considerar uma solução nativa. O EclipseLink, no entanto, nos fornece a classe *ExpressionBuilder*, que é útil nesta situação.

ExpressionBuilder é uma classe usada por componentes internos do EclipseLink. O que é importante do ponto de vista do cliente é que ela retorna objetos do tipo Expression que correspondem à interface CriteriaBuilder. Além disso, um método particularmente útil desta classe é `public Expression sql(String sql, List arguments)`.

Como primeiro parâmetro, podemos fornecer uma consulta SQL nativa. Através do segundo parâmetro do método, podemos injetar os argumentos. A função retornará um objeto que podemos usar dependendo do propósito – como uma subconsulta, condição ou lista de atributos.

## CriteriaBuilder – Subconsulta TOP N

Imagine uma loja simples – alguns clientes, pedidos e produtos. Suponha que você queira encontrar todos os clientes que pediram um dos três produtos com a classificação mais baixa. Talvez você queira dar-lhes um desconto para que sua loja não seja associada a pensamentos negativos. Um diagrama de classes simplificado de tal loja poderia ser assim:

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="Diagrama de classes para o exemplo de query TOP N" title="Diagrama de classes simplificado">

A consulta TOP N esperada que queremos que o *CriteriaBuilder* gere é:

```sql
SELECT t0.id, t0.firstname, t0.lastname
FROM customer t0
WHERE EXISTS(SELECT 1
             FROM orders t1
             WHERE ((t0.id = t1.customer_id)
                 AND (t1.product_id IN (SELECT id
                                        FROM products
                                        ORDER BY rating LIMIT 3))))
```

Começaremos pelo *EntityManager*, que você provavelmente injetará com base na plataforma preferida. Em seguida, o *ExpressionBuilder* será usado na consulta mais aninhada:

```java
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityManager;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Root;
import javax.persistence.criteria.Subquery;
import java.util.Collections;
/*...*/
public class MyService {
    /*...*/    
    @Transactional(readOnly = true)
    public List<Customer> findCustomersWithBadProducts() {
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Customer> criteriaQuery = criteriaBuilder.createQuery(Customer.class);
        Root<Customer> customer = criteriaQuery.from(Customer.class);
        Subquery<Order> orderSubQuery = criteriaQuery.subquery(Order.class);
        Root<Order> order = orderSubQuery.from(Order.class);
    
        criteriaQuery.where(
                criteriaBuilder.exists(
                        orderSubQuery.where(
                                criteriaBuilder.equal(customer.get("id"), order.get("customerId")),
                                order.get("productId").in(new ExpressionBuilder()
                                        .literal("id")
                                        .sql("SELECT ? FROM products ORDER BY rating LIMIT ?",
                                                Collections.singletonList(3)
                                        )
                                )
                        )
                )
        );
    
        return em.createQuery(criteriaQuery).getResultList();
    }
}
```

Voilà! Note que o método sql selecionará uma expressão já presente no construtor para a primeira substituição, como mostrado no exemplo. Isso é especialmente útil quando você deseja adicionar a parte nativa da consulta no final dela.

Ao especificar objetos do tipo *Path* como parâmetros, também não obteremos o resultado esperado, porque o método `toString()` será chamado neles em vez da substituição do nome da coluna do banco de dados. Finalmente, você provavelmente não escolheria este caminho a menos que esteja implementando um suporte complexo de critérios de API.
