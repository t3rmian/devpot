---
title: JPQL JOIN FETCH com CursoredStream/ScrollableCursor
url: jpql-join-fetch-distinct-cursoredstream-scrollablecursor
id: 66
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
  - hibernate
    author: Damian Terlecki
    date: 2021-05-16T20:00:00
---

No JPA 2.2, um novo método foi adicionado à interface *javax.persistence.Query*, `Stream getResultStream()`, que permite
a implementação fácil de processamento de streams. Por design, no entanto, como este método é implementado fica a critério do provedor JPA. Na maioria das vezes, porém, é apenas uma invocação do método `stream()` na lista retornada por `Query.getResultList()`:

```java
package javax.persistence;
/**/
public interface Query {
    /**
     * Execute a SELECT query and return the query results
     * as an untyped <code>java.util.stream.Stream</code>.
     * By default this method delegates to <code>getResultList().stream()</code>,
     * however persistence provider may choose to override this method
     * to provide additional capabilities.
     *
     * @return a stream of the results
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

Ao procurar uma solução para processar um grande número de registros, levando em conta a memória com uma área finita, carregar a lista inteira
pode não ser a melhor ideia. Para este propósito, cursores são uma escolha perfeita. O uso adequado deles permite reduzir o uso de memória a um nível relativamente baixo. Exemplos de tais cursores são:
- *org.eclipse.persistence.queries.CursoredStream* – cursor no EclipseLink;
- *org.eclipse.persistence.queries.ScrollableCursor* – cursor multidirecional no EclipseLink;
- *org.hibernate.ScrollableResults* – cursor no Hibernate.

Assumindo que precisamos buscar entidades de várias tabelas para nosso processamento, uma das opções é
usar o operador JPQL `[LEFT [OUTER] | INNER] JOIN FETCH join_association_path_expression`. JOIN FETCH
permite que você se livre do problema N+1, no qual ainda temos que buscar cada entidade relacionada para a raiz.
Como resolvemos isso influenciará o desempenho de nossa aplicação no final.

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

Basicamente, no EclipseLink, além do JOIN FETCH, também podemos escolher uma das duas outras soluções [(BatchFetchType EXISTS e IN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html),
que são ótimas para relacionamentos complexos. Em troca de uma consulta adicional (IN/EXISTS) para cada relação, o EL não precisa processar registros duplicados resultantes da junção. No entanto, essas alternativas não funcionam muito bem no caso do cursor, onde geralmente temos que recuperar dados relacionados após obter cada objeto subsequente. Nesse caso, a solução com EXISTS e IN volta ao ponto de partida.

Como você pode ver, duplicatas são um problema com o JOIN FETCH. Dado um modelo de loja simples: cliente (1) -> (N) pedido
e a consulta JPQL para uma entidade com tal relação (**@OneToMany**):
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
podemos esperar que o EclipseLink gere uma única consulta SQL:
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
e esperar uma lista de clientes duplicados caso eles tenham feito vários pedidos:
```sql
[{Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente B, id=2, pedidos=[10, 14, 18, 46, 47, 48]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]},
 {Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]}]
```

### JPQL SELECT DISTINCT

A solução para o problema de duplicação em JPQL é usar o operador DISTINCT na própria entidade:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```
Desta forma, com uma única consulta, obtemos uma lista desduplicada de clientes junto com seus pedidos:
```sql
[{Cliente C, id=3, pedidos=[38, 42, 52, 53, 54, 34]},
 {Cliente B, id=2, pedidos=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
Um efeito colateral disso é a adição do operador DISTINCT também na consulta SQL gerada. O Hibernate lida com este problema fornecendo ao usuário a dica [*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/), enquanto no EclipseLink não consegui encontrar tal equivalente.

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor SELECT DISTINCT

Aplicando o conhecimento sobre o operador DISTINCT também ao cursor *CursoredStream*, podemos ficar um pouco surpresos.

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

O código acima pode produzir resultados semelhantes aos abaixo:
```java
{Cliente B, id=2, pedidos=[10]}
{Cliente B, id=2, pedidos=[10]}
{Cliente B, id=2, pedidos=[10]}
{Cliente C, id=3, pedidos=[34, 38, 42, 52, 53, 54]}
{Cliente B, id=2, pedidos=[10]}
/**/
```

No entanto, mesmo sem o DISTINCT, ainda podemos ter sorte e obter registros desduplicados. Por que isso acontece? O princípio básico no qual a desduplicação é realizada em *CursoredStream/ScrollableCursor* é a ordem dos valores da chave primária nas linhas subsequentes retornadas da consulta. Se o banco de dados retornar linhas com a mesma chave primária espalhadas pelo conjunto de resultados, o EclipseLink as processará como objetos diferentes.

Para resolver o problema, basta especificar a ordem de classificação:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```
Desta forma, obtemos o mesmo resultado que com `getResultList()`:
```java
{Cliente B, id=2, pedidos=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{Cliente C, id=3, pedidos=[42, 52, 53, 54, 34, 38]}
```

Finalmente, também vale a pena otimizar nosso cursor:
- *QueryHints.SCROLLABLE_CURSOR* – permite usar o ScrollableCursor (pode mover para trás);
- *QueryHints.RESULT_SET_TYPE* – define a direção do cursor;
- *QueryHints.RESULT_SET_CONCURRENCY* – habilita a otimização para leitura;
- *QueryHints.CURSOR_INITIAL_SIZE* – configura o número de objetos pré-construídos para a primeira página do cursor;
- *QueryHints.CURSOR_PAGE_SIZE* – define o número de objetos buscados (o método `next()`) quando o buffer está vazio;
- *QueryHints.READ_ONLY* – habilitado quando o registro no contexto de persistência não é necessário (reduz o consumo de memória).
