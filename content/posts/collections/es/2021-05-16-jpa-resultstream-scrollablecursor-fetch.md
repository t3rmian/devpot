---
title: JPQL JOIN FETCH con CursoredStream/ScrollableCursor
url: jpql-join-fetch-distinct-cursoredstream-scrollablecursor
id: 66
category:
- jpa: JPA
  # "JPA" se mantiene como término estándar
tags:
  - sql
  - eclipselink
  - hibernate
author: Damian Terlecki
date: 2021-05-16T20:00:00
---

En JPA 2.2 se añadió un nuevo método a la interfaz *javax.persistence.Query*, `Stream getResultStream()`, que permite implementar procesamiento en stream de forma sencilla. Sin embargo, el diseño deja la implementación a criterio del proveedor JPA. Lo más habitual es que simplemente invoque el método `stream()` sobre la lista devuelta por `Query.getResultList()`:

```java
package javax.persistence;
/**/
public interface Query {
    /**
     * Ejecuta una consulta SELECT y devuelve los resultados
     * como un <code>java.util.stream.Stream</code> sin tipo.
     * Por defecto este método delega en <code>getResultList().stream()</code>,
     * aunque el proveedor de persistencia puede sobrescribirlo
     * para ofrecer capacidades adicionales.
     *
     * @return un stream de resultados
     * @throws (...)
     * @see Stream
     * @see #getResultList()
     * @since 2.2
     */
    default Stream getResultStream() {
        return getResultList().stream();
    }
    /**/
}
```

Cuando buscamos una solución para procesar un gran número de registros, considerando la memoria limitada, cargar toda la lista puede no ser la mejor idea. Para esto, los cursores son perfectos. Un uso adecuado permite reducir el consumo de memoria a un nivel bajo. Ejemplos de cursores:
- *org.eclipse.persistence.queries.CursoredStream* – cursor en EclipseLink;
- *org.eclipse.persistence.queries.ScrollableCursor* – cursor multidireccional en EclipseLink;
- *org.hibernate.ScrollableResults* – cursor en Hibernate.

Si necesitamos obtener entidades de varias tablas para nuestro procesamiento, una opción es usar el operador JPQL `[LEFT [OUTER] | INNER] JOIN FETCH join_association_path_expression`. JOIN FETCH permite evitar el problema N+1, donde habría que obtener cada entidad relacionada para la raíz. Cómo resolvamos esto influirá en el rendimiento de la aplicación.

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

En EclipseLink, además de JOIN FETCH, podemos elegir otras dos soluciones [(BatchFetchType EXISTS e IN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html), óptimas para relaciones complejas. A cambio de una consulta adicional (IN/EXISTS) por cada relación, EL no necesita procesar registros duplicados del join. Sin embargo, estas alternativas no funcionan bien con cursores, donde normalmente hay que recuperar datos relacionados tras cada objeto. En este caso, la solución con EXISTS e IN vuelve al punto de partida.

Como se ve, los duplicados son un problema con JOIN FETCH. Dado un modelo simple de tienda: cliente (1) -> (N) pedido y la consulta JPQL para una entidad con esa relación (**@OneToMany**):
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
se puede esperar que EclipseLink genere una sola consulta SQL:
```sql
SELECT t1.ID,
       t1.FIRSTNAME,
       t1.LASTNAME,
       t0.ID,
       t0.ADDRESSID,
       t0.CUSTOMERID,
FROM orders t0,
     customers t1
WHERE (t0.CUSTOMERID = t1.ID)
```
y obtener una lista de clientes duplicados si tienen varios pedidos:
```sql
[{Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

### JPQL DISTINCT SELECT

La solución al problema de duplicados en JPQL es usar el operador DISTINCT sobre la entidad:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```
Así, con una sola consulta, obtenemos una lista deduplicada de clientes junto con sus pedidos:
```sql
[{Customer C, id=3, orders=[38, 42, 52, 53, 54, 34]},
 {Customer B, id=2, orders=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
Un efecto secundario es que el operador DISTINCT también se añade a la consulta SQL generada. Hibernate resuelve esto con el hint [*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/), mientras que en EclipseLink no encontré equivalente.

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor DISTINCT SELECT

Aplicando el conocimiento sobre DISTINCT también al cursor *CursoredStream*, podemos llevarnos una sorpresa.

```java
Query query = em.createQuery("""
    SELECT DISTINCT customer
    FROM Customer customer
    JOIN FETCH customer.orders
""");
query.setHint("eclipselink.cursor", true); // org.eclipse.persistence.config.QueryHints.CURSOR
CursoredStream cursor = (CursoredStream) query.getSingleResult();
while (cursor.hasNext()) {
    System.out.println(cursor.next());
}
cursor.close();
```

El código anterior puede producir resultados como:
```java
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}
{Customer B, id=2, orders=[10]}
/**/
```

Sin embargo, incluso sin DISTINCT, podemos tener suerte y obtener registros deduplicados. ¿Por qué? El principio básico de la deduplicación en *CursoredStream/ScrollableCursor* es el orden de las claves primarias en las filas devueltas por la consulta. Si la base de datos devuelve filas con la misma clave primaria dispersas, EclipseLink las procesará como objetos distintos.

Para resolverlo, basta con especificar el orden:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```
Así obtenemos el mismo resultado que con `getResultList()`:
```java
{Customer B, id=2, orders=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{Customer C, id=3, orders=[42, 52, 53, 54, 34, 38]}
```

Por último, también conviene optimizar el cursor:
- *QueryHints.SCROLLABLE_CURSOR* – permite usar ScrollableCursor (puede moverse hacia atrás);
- *QueryHints.RESULT_SET_TYPE* – define la dirección del cursor;
- *QueryHints.RESULT_SET_CONCURRENCY* – habilita optimización para lectura;
- *QueryHints.CURSOR_INITIAL_SIZE* – configura el número de objetos preconstruidos para la primera página del cursor;
- *QueryHints.CURSOR_PAGE_SIZE* – define el número de objetos recuperados (método `next()`) cuando el buffer está vacío;
- *QueryHints.READ_ONLY* – habilitado cuando no se necesita registrar en el contexto de persistencia (reduce consumo de memoria).
