---
title: JPA (EclipseLink) CriteriaBuilderでのネイティブSQL
url: jpa-criteriabuilder-ネイティブsql-eclipselink
id: 64
category:
- jpa: JPA
tags:
- sql
- eclipselink
author: Damian Terlecki
date: 2021-04-18T20:00:00
---

JPA CriteriaBuilderを使用していると、遅かれ早かれ仕様に起因するいくつかの制限に遭遇するでしょう。
そのような例として、サブクエリで返される結果の最大数を制限することや、NULL値のソート順を変更することが挙げられます。
Hibernateの代替としてEclipseLinkは、*JpaCriteriaBuilder*インターフェースと*ExpressionBuilder*クラスの形で、
かなり素晴らしい抽象化を提供しています。

## TOP Nクエリ

TOP Nクエリは、データベースからN件のレコードを取得したい標準的なクエリです。
多くの場合、関心のある属性でソートされます。
例えば、評価が最も高い5つの製品を知りたい場合があります（H2データベースの構文）。

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 5;
```

このようなクエリは、*EntityManager*から参照を取得する*CriteriaBuilder*クラス（実際には`CriteriaQuery.orderBy()`と`Query.setMaxResults()`を介して）を使用して簡単に構築できます。
これをサブクエリとして使用したい場合、問題はより複雑になります。

現在のJPA 2.2バージョンでは、そのような可能性は提供されていません。もちろん、
問題を2つのクエリに分割したり、ネイティブな解決策を検討したりすることもできます。しかし、EclipseLinkは、
この状況で役立つ*ExpressionBuilder*クラスを提供しています。

ExpressionBuilderは、EclipseLinkの内部コンポーネントによって使用されるクラスです。
クライアントの観点から重要なのは、CriteriaBuilderインターフェースに一致するExpression型のオブジェクトを返すことです。
さらに、このクラスの特に便利なメソッドは`public Expression sql(String sql, List arguments)`です。

最初のパラメータとして、ネイティブSQLクエリを提供できます。
メソッドの2番目のパラメータを介して、引数を注入できます。
この関数は、目的に応じて使用できるオブジェクトを返します。サブクエリ、条件、または属性のリストとして。

## CriteriaBuilder – TOP Nサブクエリ

単純な店舗を想像してみてください。顧客、注文、製品がいくつかあります。
評価が最も低い3つの製品のいずれかを注文したすべての顧客を見つけたいとします。
おそらく、あなたの店舗が否定的な考えと結びつかないように、彼らに割引を与えたいと思うでしょう。
そのような店舗の簡略化されたクラス図は次のようになります。

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="TOP Nクエリサンプルのクラス図" title="簡略化されたクラス図">

*CriteriaBuilder*に生成させたい期待されるTOP Nクエリは次のとおりです。

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

まず*EntityManager*から始めます。
これはおそらく、好みのプラットフォームに基づいて注入されるでしょう。
次に、最もネストされたクエリで*ExpressionBuilder*が使用されます。

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

これで完成です！例で示されているように、sqlメソッドは最初の置換のためにビルダーにすでに存在する式を選択することに注意してください。
これは、クエリの最後尾にネイティブ部分を追加したい場合に特に役立ちます。

*Path*型のオブジェクトをパラメータとして指定しても、期待される結果は得られません。
なぜなら、データベースのカラム名の置換の代わりに、それらに対して`toString()`メソッドが呼び出されるからです。
最後に、複雑なAPIの条件サポートを実装しているのでなければ、おそらくこのルートは選ばないでしょう。


