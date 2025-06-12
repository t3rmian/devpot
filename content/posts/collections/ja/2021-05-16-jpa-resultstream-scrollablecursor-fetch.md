---
title: CursoredStream/ScrollableCursor を使った JPQL JOIN FETCH
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

JPA 2.2では、*javax.persistence.Query*インターフェースに新しいメソッド`Stream getResultStream()`が追加され、
ストリーム処理を簡単に実装できるようになりました。しかし、設計上、このメソッドの実装方法は
JPAプロバイダの裁量に委ねられています。しかし、ほとんどの場合、`Query.getResultList()`から返されたリストに対して`stream()`メソッドを呼び出すだけです。

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

大量のレコードを処理するためのソリューションを探しているとき、有限の領域を持つメモリを考慮すると、リスト全体をロードすることは
最善のアイデアではないかもしれません。この目的のためには、カーソルが最適です。これを適切に使用することで、
メモリ使用量を比較的低いレベルまで削減できます。そのようなカーソルの例は次のとおりです。
- *org.eclipse.persistence.queries.CursoredStream* – EclipseLinkのカーソル
- *org.eclipse.persistence.queries.ScrollableCursor* – EclipseLinkの双方向カーソル
- *org.hibernate.ScrollableResults* – Hibernateのカーソル

処理のために複数のテーブルからエンティティをフェッチする必要があると仮定すると、一つの選択肢は
JPQL演算子`[LEFT [OUTER] | INNER] JOIN FETCH join_association_path_expression`を使用することです。JOIN FETCH
を使用すると、ルートエンティティごとに関連エンティティをフェッチし続ける必要があるN+1問題を解消できます。
これをどのように解決するかが、最終的にアプリケーションのパフォーマンスに影響します。

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

基本的に、EclipseLinkではJOIN FETCH以外にも、複雑なリレーションシップに最適な
他の2つのソリューション[(BatchFetchType EXISTSおよびIN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html)のいずれかを選択できます。
リレーションごとにクエリを追加する（IN/EXISTS）代わりに、ELは結合から生じる重複レコードを処理する必要がありません。
しかし、これらの代替案はカーソルの場合にはあまりうまく機能しません。カーソルでは、通常、後続のオブジェクトを取得した後に関連データを取得する必要があります。
この場合、EXISTSとINを使用するソリューションは、出発点に戻ってしまいます。


ご覧のとおり、重複はJOIN FETCHの問題です。単純な店舗モデルを考えてみましょう。顧客（1）->（N）注文
そして、そのような（**@OneToMany**）リレーションを持つエンティティに対するJPQLクエリ：
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
EclipseLinkは単一のSQLクエリを生成することが期待できます。
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
そして、複数の注文をした顧客の場合、重複した顧客のリストが期待されます。
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

JPQLでの重複問題の解決策は、エンティティ自体にDISTINCT演算子を使用することです。
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```
このようにして、1つのクエリで、注文とともに重複排除された顧客のリストを取得します。
```sql
[{Customer C, id=3, orders=[38, 42, 52, 53, 54, 34]},
 {Customer B, id=2, orders=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
この副作用として、生成されるSQLクエリにもDISTINCT演算子が追加されます。
Hibernateはこの問題に、ユーザーに[*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/)
ヒントを提供することで対処していますが、EclipseLinkでは同等のものが見つかりませんでした。

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor DISTINCT SELECT

DISTINCT演算子に関する知識を*CursoredStream*カーソルにも適用すると、少し驚くかもしれません。

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

上記のコードは、以下のような結果を生成する可能性があります。
```java
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}
{Customer B, id=2, orders=[10]}
/**/
```

しかし、DISTINCTがなくても、運が良ければ重複排除されたレコードを取得できることがあります。なぜでしょうか？
*CursoredStream/ScrollableCursor*で重複排除が行われる基本原則は、クエリから返される後続の行の主キー値の順序です。
データベースが結果セットのあちこちに同じ主キーを持つ行を返した場合、
EclipseLinkはそれらを異なるオブジェクトとして処理します。

問題を解決するには、ソート順を指定するだけです。
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```
これにより、`getResultList()`と同じ結果が得られます。
```java
{Customer B, id=2, orders=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{Customer C, id=3, orders=[42, 52, 53, 54, 34, 38]}
```

最後に、カーソルを最適化することも価値があります。
- *QueryHints.SCROLLABLE_CURSOR* – 代わりにScrollableCursorを使用できます（後方に移動可能）。
- *QueryHints.RESULT_SET_TYPE* – カーソルの方向を定義します。
- *QueryHints.RESULT_SET_CONCURRENCY* – 読み取りの最適化を有効にします。
- *QueryHints.CURSOR_INITIAL_SIZE* – カーソルの最初のページ用に事前に構築されるオブジェクトの数を設定します。
- *QueryHints.CURSOR_PAGE_SIZE* – バッファが空のときにフェッチされるオブジェクトの数を定義します（`next()`メソッド）。
- *QueryHints.READ_ONLY* – 永続性コンテキストへの登録が不要な場合に有効にします（メモリ消費を削減）。

