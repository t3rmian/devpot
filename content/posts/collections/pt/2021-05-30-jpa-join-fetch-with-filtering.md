---
title: JPQL JOIN FETCH com condição
url: jpql-join-fetch-com-condicao
id: 67
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
  - hibernate
author: Damian Terlecki
date: 2021-05-30T20:00:00
---

Um dos casos interessantes relacionados à construção de consultas JPQL (Java Persistence Query Language)
é a possibilidade de filtrar as entidades relacionadas ao usar a cláusula JOIN FETCH.
A especificação JPA versão 2.2 ([JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf))
define a seguinte sintaxe para consultas JPQL usando JOIN e JOIN FETCH.

```groovy
join ::= join_spec join_association_path_expression [AS] identification_variable [join_condition]

fetch_join ::= join_spec FETCH join_association_path_expression

join_association_path_expression ::=
    join_collection_valued_path_expression |
    join_single_valued_path_expression |
    TREAT(join_collection_valued_path_expression AS subtype) |
    TREAT(join_single_valued_path_expression AS subtype)

join_collection_valued_path_expression ::=
    identification_variable.{single_valued_embeddable_object_field.}*collection_valued_field

join_single_valued_path_expression ::=
    identification_variable.{single_valued_embeddable_object_field.}*single_valued_object_field

join_spec ::= [ LEFT [OUTER] | INNER ] JOIN

join_condition ::= ON conditional_expression
```

A partir disso, podemos ver que, no caso de um JOIN FETCH, não é possível dar um alias ou definir condições de junção adicionais.
No entanto, tanto o EclipseLink quanto o Hibernate como implementações da especificação JPA, em suas extensões JPQL - respectivamente
EQL (EclipseLink Query Language) e HQL (Hibernate Query Language) - oferecem aos desenvolvedores uma gama maior de possibilidades.

Então, vamos pegar um modelo simples de uma loja em que temos uma relação cliente (1) - (N) pedidos. Sabendo o ID do pedido,
vamos tentar buscar informações sobre o cliente e apenas este pedido específico usando uma única consulta JPQL do banco de dados.

```java
@Entity
@Table(name = "customers")
public class Customer {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    private String firstName;
    private String lastName;
    
    @OneToMany(mappedBy = "customer")
    private List<Order> orders;
    //...
}

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    @Column(name="CUSTOMERID")
    private Long customerId;

    @ManyToOne
    @JoinColumn(name = "CUSTOMERID", referencedColumnName = "ID", insertable = false, updatable = false)
    private Customer customer;
    //...
}
```

Para ilustrar os resultados da consulta, vamos assumir o seguinte estado do banco de dados:
```sql
[{Cliente A, id=1, pedidos=[]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]}]
```

## EQL JOIN FETCH com condição

O EclipseLink, no caso do JOIN FETCH, permite tanto o uso de uma condição na cláusula ON quanto a definição de tal condição
em uma cláusula WHERE, referenciando um alias do JOIN.

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

O EclipseLink gerará a seguinte consulta SQL:

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### Cache

Se o EclipseLink retornará um cliente com uma lista filtrada de pedidos `[{Cliente B, id = 2, pedidos = [10]}]`
ou com todos os pedidos deste cliente `[{Cliente B, id = 2, pedidos = [10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]`, depende das configurações de cache. Há uma razão pela qual na [documentação JPQL do EclipseLink](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL),
a seguinte nota pode ser encontrada:

> JOIN FETCH normalmente não permite um alias, mas a partir do EclipseLink 2.4 um alias é permitido. O alias deve ser usado com cautela, pois pode afetar como os objetos resultantes são construídos. Os objetos normalmente devem ter sempre os mesmos dados, não importa como foram consultados, isso é importante para o cache e a consistência.<br/>Isso só é um problema se o alias for usado na cláusula WHERE em um relacionamento de coleção para filtrar os objetos relacionados que serão buscados. Isso não deve ser feito, mas às vezes é desejável, caso em que a consulta deve garantir que foi configurada para IGNORAR (BYPASS) o cache.

Por exemplo, se na mesma transação buscamos anteriormente nosso cliente do banco de dados `SELECT c FROM Customers c WHERE c.id = 2`
e o objeto foi registrado no cache de primeiro nível (*EntityManager*); ou se habilitamos o cache de segundo nível (*EntityManagerFactory*)
e o objeto foi adicionado lá como resultado de outra transação, receberemos uma lista completa de pedidos do cliente.

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="Cache L1 e L2 do JPA" title="Cache L1 e L2 do JPA">

Se você deseja receber uma lista com o pedido específico, neste caso, adicione uma dica (hint) para o EclipseLink ignorar tanto o cache L1 quanto o L2 no objeto do tipo *Query*: `query.setHint("eclipselink.maintain-cache", "false")`. Desta forma, o EL construirá o objeto diretamente dos resultados da consulta e não poluirá o contexto com um objeto inconsistente do ponto de vista do JPA.

### Distinct

Se, após aplicar a condição, esperamos buscar não uma, mas N entidades relacionadas, então devemos usar a cláusula DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **Nota:** Tenha cuidado para não usar parênteses com a cláusula DISTINCT, por exemplo: DISTINCT(c). O EclipseLink é sensível a isso e gerará consultas bastante questionáveis, a ponto de descartar a condição no caso da cláusula ON:
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## HQL JOIN FETCH com condição

Semelhante ao EclipseLink, o Hibernate também suporta a definição de uma condição referenciando um alias:

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

No entanto, definir tal condição na cláusula ON é proibido:

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### Cache

Também no caso do Hibernate, teremos que levar em conta possíveis problemas de cache. Para não sobrecarregar o cache L1, uma opção é criar uma [sessão sem estado (stateless session)](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html) separada, reutilizando a mesma conexão. Tal sessão não implementa o cache L1 e não interage com o cache L2:
```java
Session session = em.unwrap(Session.class);
SessionFactory sessionFactory = session.getSessionFactory();
List<Customer> customers = session.doReturningWork(connection -> {
    StatelessSession statelessSession = sessionFactory.openStatelessSession(connection);
    return statelessSession.createQuery("""
        SELECT c
        FROM Customer c
        JOIN FETCH c.orders o
        WHERE o.id = 10
        """, Customer.class).getResultList();
});
```

### Distinct

Da mesma forma, se após aplicar a condição esperamos buscar não uma, mas N entidades relacionadas, então devemos adicionar a cláusula DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

Desta forma, eliminamos o problema de objetos duplicados no nível pai (neste caso, cliente):
```sql
--Distinct:
[{Cliente B, id=5, pedidos=[10, 49]},
 {Cliente C, id=6, pedidos=[34]}]
--Sem distinct:
[{Cliente B, id=5, pedidos=[10, 49]},
 {Cliente C, id=6, pedidos=[34]},
 {Cliente B, id=5, pedidos=[10, 49]}]
```

Através da aplicação da dica "*hibernate.query.passDistinctThrough*" com um valor "*false*", também podemos nos livrar da cláusula DISTINCT da consulta SQL. O banco de dados terá um pequeno respiro, e o Hibernate não se esquecerá da desduplicação também.

## Resumo

Embora a especificação JPA não permita adicionar condições às entidades relacionadas na cláusula JOIN FETCH, tanto o EclipseLink quanto o Hibernate oferecem essa possibilidade. Em ambos os casos, no entanto, devemos ter cuidado ao construir tais consultas e levar em conta possíveis problemas com cache e duplicação de objetos retornados. Isso também será importante dependendo de você precisar dos resultados como objetos gerenciados ou não.
