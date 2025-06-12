---
title: SQL nativo en JPA (EclipseLink) CriteriaBuilder
url: jpa-criteriabuilder-native-sql-eclipselink
id: 64
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
author: Damian Terlecki
date: 2021-04-18T20:00:00
---

Cuando usas el CriteriaBuilder de JPA, tarde o temprano te toparás con algunas limitaciones
que provienen de la propia especificación. Un ejemplo de esto puede ser limitar el número máximo de resultados
devueltos en una subconsulta, o cambiar el orden de los valores NULL al ordenar.
EclipseLink, como alternativa a Hibernate, ofrece una abstracción bastante interesante en forma de la
interfaz *JpaCriteriaBuilder* y la clase *ExpressionBuilder*.

## Consulta TOP N

La consulta TOP N es una consulta estándar en la que queremos recuperar N registros de la base de datos,
normalmente ordenados por algún atributo que nos interesa.
Por ejemplo, podríamos querer saber cuáles son los 5 productos mejor valorados (sintaxis de H2 database):

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 5;
```

Podemos construir fácilmente una consulta así usando la clase *CriteriaBuilder* (en realidad a través de `CriteriaQuery.orderBy()` y `Query.setMaxResults()`), a la que accedemos desde el *EntityManager*.
Pero si queremos poner esto como una subconsulta, la cosa se complica.

La versión actual de JPA 2.2 no nos da esa posibilidad. Por supuesto, podemos
dividir el problema en dos consultas o considerar una solución nativa. Sin embargo, EclipseLink nos proporciona
la clase *ExpressionBuilder*, que resulta útil en este caso.

ExpressionBuilder es una clase utilizada por componentes internos de EclipseLink.
Lo importante desde el punto de vista del cliente es que devuelve objetos de tipo Expression compatibles con la interfaz CriteriaBuilder.
Además, un método especialmente útil de esta clase es `public Expression sql(String sql, List arguments)`.

Como primer parámetro, podemos pasar una consulta SQL nativa.
A través del segundo parámetro del método, inyectamos los argumentos.
La función devolverá un objeto que podemos usar según el propósito: como subconsulta, condición o lista de atributos.

## CriteriaBuilder – Subconsulta TOP N

Imagina una tienda sencilla: algunos clientes, pedidos y productos.
Supón que quieres encontrar todos los clientes que han pedido uno de los tres productos peor valorados.
Quizá quieras darles un descuento para que tu tienda no se asocie con malas experiencias.
Un diagrama de clases simplificado de esa tienda podría verse así:

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="Diagrama de clases para ejemplo de consulta TOP N" title="Diagrama de clases simplificado">

La consulta TOP N que esperamos que genere el *CriteriaBuilder* sería:

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

Partimos del *EntityManager*,
que probablemente inyectarás según la plataforma que uses.
Luego, se utiliza el *ExpressionBuilder* en la consulta más interna:

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

¡Voilà! Ten en cuenta que el método sql seleccionará una expresión ya presente en el builder para la primera sustitución,
como se muestra en el ejemplo. Esto es especialmente útil cuando quieres añadir la parte nativa de la consulta al
final de la misma.

Si pasas objetos de tipo *Path* como parámetros, tampoco obtendrás el resultado esperado,
porque se llamará a su método `toString()` en vez de sustituir el nombre de la columna de la base de datos.
En definitiva, probablemente no elegirías este camino salvo que estés implementando un soporte de criterios de API complejo.

