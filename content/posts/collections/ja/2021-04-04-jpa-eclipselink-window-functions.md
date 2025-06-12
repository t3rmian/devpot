---
title: JPA (EclipseLink) ウィンドウ関数
url: jpa-eclipselink-ウィンドウ関数
id: 63
category:
- jpa: JPA
tags:
- sql
- eclipselink
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

データベースのウィンドウ関数は、特定のトレンドに関する情報を提示する詳細なレポートを作成できる
分析関数のグループです。このような関数の例として、特定のグループの合計が挙げられます。
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```

JPAはこの目的のための理想的なツールではありませんが、この技術に基づいた既存のアプリケーションフレームワークで
この機能を使用する必要があるかもしれません。
JPA仕様自体はそのようなメソッドを提供しておらず、ネイティブクエリに頼ることを余儀なくされますが、
その個々の実装は、私たちにいくつかの強力な拡張機能を提供します。

EclipseLinkを使用してこのようなウィンドウ関数を持つクエリを構築するにはどうすればよいでしょうか？
これを説明するために、[MySQLデータベースのドキュメント](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html)のサンプルを使用します。
まず、単純なテーブルを作成し、データで埋めます。

```sql
CREATE TABLE sales (
    id NUMBER PRIMARY KEY,
    year NUMBER,
    country VARCHAR2(255),
    product VARCHAR2(255),
    profit NUMBER
);

INSERT ALL
    INTO sales VALUES(1, 2000, 'Finland', 'Computer', 1500)
    INTO sales VALUES(2, 2000, 'Finland', 'Phone', 100)
    INTO sales VALUES(3, 2001, 'Finland', 'Phone', 10)
    INTO sales VALUES(4, 2000, 'India', 'Calculator', 75)
    INTO sales VALUES(5, 2000, 'India', 'Calculator', 75)
    INTO sales VALUES(6, 2000, 'India', 'Computer', 1200)
    INTO sales VALUES(7, 2000, 'USA', 'Calculator', 75)
    INTO sales VALUES(8, 2000, 'USA', 'Computer', 1500)
    INTO sales VALUES(9, 2001, 'USA', 'Calculator', 50)
    INTO sales VALUES(10, 2001, 'USA', 'Computer', 1500)
    INTO sales VALUES(11, 2001, 'USA', 'Computer', 1200)
    INTO sales VALUES(12, 2001, 'USA', 'TV', 150)
    INTO sales VALUES(13, 2001, 'USA', 'TV', 100)
SELECT * FROM dual;
commit;
```

次に、テーブルをJPAエンティティにマッピングします。

```java

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Table(name = "sales")
@Entity
public class Sales {

    @Id
    @Column(name = "year")
    private Integer year;

    @Column(name = "country")
    private String country;

    @Column(name = "product")
    private String product;

    @Column(name = "profit")
    private Long profit;

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public Long getProfit() {
        return profit;
    }

    public void setProfit(Long profit) {
        this.profit = profit;
    }

}
```

そして、関数の実装を開始できます。
EclipseLinkでは、*ExpressionOperator*クラスで選択された整数下に登録することで、独自の演算子と関数を定義できます。
独自の関数を追加する場合、使用する数値を1か所で宣言することをお勧めします。

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

次に、ExpressionOperatorオブジェクトのインスタンスを作成することで、関数の引数とターゲットクラスを定義します。
ターゲットクラスには、*ClassConstants*クラスでEclipseLinkによってすでに定義されているオプションの1つを選択できます。
標準的な選択は*FunctionExpression*ですが、関数が動的な数の引数を持つ場合（例えば、すでに定義されている*COALESCE*関数）、
*ArgumentListFunctionExpression*を使用することもできます。

```java
import org.eclipse.persistence.expressions.ExpressionOperator;
import org.eclipse.persistence.internal.helper.ClassConstants;
import org.eclipse.persistence.internal.helper.NonSynchronizedVector;

public class MyDao {
    /*...*/
    static {
        ExpressionOperator sumOver = new ExpressionOperator();
        sumOver.setSelector(600);
        NonSynchronizedVector args = NonSynchronizedVector.newInstance();
        args.add("SUM(");
        args.add(") OVER(");
        args.add(")");
        sumOver.printsAs(args);
        sumOver.bePrefix();
        sumOver.setNodeClass(ClassConstants.FunctionExpression_Class);
        ExpressionOperator.addOperator(sumOver);
    }
}
```

一度、例えばクラスがロードされるときに静的ブロックで関数を追加すれば十分です。
しかし、データベースごとに別の実装が必要な場合、セットアップは異なります。

その場合、*DatabasePlatform*を継承するEclipseLinkクラスを見つけ、
対象とするデータベースの関数を実装します。次に、このクラスを拡張して、オーバーライドされた*initializePlatformOperators()*
メソッドで独自の演算子を追加し、*persistence.xml*ファイルで新しく定義されたプラットフォームを選択します。

```xml
<persistence xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.2"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence http://xmlns.jcp.org/xml/ns/persistence/persistence_2_2.xsd">
    <persistence-unit name="my-persistence-unit">
        <properties>
            <property name="eclipselink.target-database" value="my.package.Class"/>
        </properties>
    </persistence-unit>
</persistence>
```

最後に、JPA EclipseLink拡張機能を通じて新しい関数を使用できます。
JPA *CriteriaBuilder*インターフェースから始めて、それをEclipseLink *JpaCriteriaBuilder*インターフェースにキャストします。
次に、それを使用して新しい関数の引数を作成し、JPA互換のインターフェースに置き換えます。
関数自体は、以前に登録された整数を参照して*ExpressionBuilder*クラスを使用して作成できます。

```java
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.jpa.JpaCriteriaBuilder;

import javax.persistence.EntityManager;
import javax.persistence.Tuple;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Expression;
import javax.persistence.criteria.Root;

public class MyDao {
    /*...*/
    public void runQuery() {
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = criteriaBuilder.createQuery(Tuple.class);
        Root<Sales> root = query.from(Sales.class);

        JpaCriteriaBuilder jpaCriteriaBuilder = (JpaCriteriaBuilder) criteriaBuilder;
        org.eclipse.persistence.expressions.Expression sumMoney = jpaCriteriaBuilder.toExpression(root.get("profit"));
        org.eclipse.persistence.expressions.Expression country = jpaCriteriaBuilder.toExpression(root.get("country"));
        ExpressionBuilder expressionBuilder = new ExpressionBuilder();
        org.eclipse.persistence.expressions.Expression sumMoneyOverCountry =
                expressionBuilder.getOperator(MyExpressionOperators.SUM_OVER)
                        .newExpressionForArgument(sumMoney, country);
        query.select(criteriaBuilder.tuple(
                root.get("year"),
                root.get("country"),
                root.get("product"),
                root.get("profit"),
                jpaCriteriaBuilder.fromExpression(sumMoneyOverCountry, Long.class)));
        entityManager.createQuery(query).getResultList();
    }
}
```

最終的に、結果はMySQLドキュメントの例と同じになるはずです。

<img src="/img/hq/jpa-window-functions.png" alt="ウィンドウ関数の結果を示すスクリーンショット" title="EclipseLink – ウィンドウ関数の結果">

JPQLの場合、`SQL`演算子のおかげで解決策は同じくらい簡単です。
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

`SQL`演算子は、EclipseLinkの*Expression*クラスのメソッドとしても利用できます。関数を登録する必要なく使用することもできます
（より単純な[`FUNC`/`FUNCTION`演算子](https://www.eclipse.org/eclipselink/documentation/3.0/jpa/extensions/jpql.htm#CIHCCHIC)と同様）。
最後に、`ExpressionOperator.registerOperator(int selector, String name)`を介して特定の名前で登録された関数を使用するための`OPERATOR`構文を確認してください。
