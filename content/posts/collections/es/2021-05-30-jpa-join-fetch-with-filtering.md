---
title: JPQL JOIN FETCH con condición
url: jpql-join-fetch-with-condition
id: 67
category:
- jpa: JPA
  # "JPA" se mantiene como término estándar
tags:
  - sql
  - eclipselink
  - hibernate
author: Damian Terlecki
date: 2021-05-30T20:00:00
---

Uno de los casos interesantes al construir consultas JPQL (Java Persistence Query Language) es la posibilidad de filtrar entidades relacionadas usando la cláusula JOIN FETCH. La especificación JPA 2.2 ([JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf)) define la siguiente sintaxis para consultas JPQL con JOIN y JOIN FETCH.

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

De aquí vemos que en el caso de JOIN FETCH no es posible dar un alias ni definir condiciones adicionales de join. Sin embargo, tanto EclipseLink como Hibernate, en sus extensiones JPQL (EQL y HQL respectivamente), ofrecen más posibilidades.

Tomemos un modelo simple de tienda donde tenemos una relación cliente (1) - (N) pedidos. Sabiendo el ID del pedido, intentemos obtener información del cliente y solo ese pedido específico usando una sola consulta JPQL.

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

Para ilustrar los resultados, supongamos el siguiente estado de la base de datos:
```sql
[{Customer A, id=1, orders=[]},
 {Customer B, id=2, orders=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

## EQL JOIN FETCH con condición

EclipseLink permite en JOIN FETCH tanto el uso de una condición en la cláusula ON como definir la condición en WHERE referenciando un alias de JOIN.

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

EclipseLink generará la siguiente consulta SQL:

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### Caché

Que EclipseLink devuelva un cliente con la lista filtrada de pedidos `[{Customer B, id = 2, orders = [10]}]` o con todos los pedidos de ese cliente `[{Customer B, id = 2, orders = [10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]` depende de la configuración de caché. Por eso, en la [documentación de JPQL de EclipseLink](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL) se encuentra la siguiente nota:

> JOIN FETCH normalmente no permite alias, pero desde EclipseLink 2.4 se permite. El alias debe usarse con precaución, ya que puede afectar cómo se construyen los objetos resultantes. Los objetos deberían tener siempre los mismos datos, sin importar cómo se consulten, lo cual es importante para la caché y la consistencia.<br/>Esto solo es un problema si el alias se usa en WHERE sobre una relación de colección para filtrar los objetos relacionados que se van a obtener. No debería hacerse, pero a veces es deseable; en ese caso, la consulta debe asegurarse de BYPASS la caché.

Por ejemplo, si en la misma transacción ya obtuvimos el cliente con `SELECT c FROM Customers c WHERE c.id = 2` y el objeto se registró en la caché de primer nivel (*EntityManager*), o si tenemos activada la caché de segundo nivel (*EntityManagerFactory*) y el objeto se añadió allí en otra transacción, recibiremos la lista completa de pedidos del cliente.

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="JPA L1 and L2 Cache" title="JPA L1 and L2 Cache">

Si quieres recibir solo el pedido específico, añade el hint para que EclipseLink omita tanto la caché L1 como L2 en el objeto *Query*: `query.setHint("eclipselink.maintain-cache", "false")`. Así EL construirá el objeto directamente desde los resultados y no contaminará el contexto con un objeto inconsistente desde el punto de vista JPA.

### Distinct

Si tras aplicar la condición esperamos obtener no uno, sino N entidades relacionadas, debemos usar la cláusula DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **Nota:** No uses paréntesis con la cláusula DISTINCT, por ejemplo: DISTINCT(c). EclipseLink es sensible a esto y puede generar consultas dudosas, incluso omitiendo la condición en el caso de la cláusula ON:
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## HQL JOIN FETCH con condición

De forma similar, Hibernate también permite definir una condición referenciando un alias:

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

Sin embargo, definir la condición en la cláusula ON está prohibido:

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### Caché

También en Hibernate debemos tener en cuenta posibles problemas de caché. Para no contaminar la caché L1, una opción es crear una [stateless session](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html) reutilizando la misma conexión. Dicha sesión no implementa caché L1 ni interactúa con la L2:
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

Igualmente, si tras aplicar la condición esperamos obtener no uno, sino N entidades relacionadas, debemos añadir la cláusula DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

Así eliminamos el problema de objetos duplicados a nivel del padre (en este caso, cliente):
```sql
--Distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]}]
--Sin distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]},
 {Customer B, id=5, orders=[10, 49]}]
```

Aplicando el hint "*hibernate.query.passDistinctThrough*" con valor "*false*" también podemos eliminar la cláusula DISTINCT de la consulta SQL. La base de datos trabajará menos y Hibernate igualmente hará la deduplicación.

## Resumen

Aunque la especificación JPA no permite añadir condiciones sobre entidades relacionadas en la cláusula JOIN FETCH, tanto EclipseLink como Hibernate ofrecen esta posibilidad. En ambos casos, debemos ser cuidadosos al construir estas consultas y tener en cuenta posibles problemas de caché y duplicación de objetos devueltos. Esto también será importante según si necesitas los resultados como objetos gestionados o no.
