---
title: 条件付きJPQL JOIN FETCH
url: jpql-join-fetch-条件付き
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

JPQL（Java Persistence Query Language）クエリの構築に関連する興味深いケースの一つに、
JOIN FETCH句を使用する際に関連エンティティをフィルタリングする可能性があります。
JPA仕様バージョン2.2（[JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf)）
では、JOINおよびJOIN FETCHを使用するJPQLクエリに対して以下の構文が定義されています。

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

これを見ると、JOIN FETCHの場合はエイリアスを与えたり、追加の結合条件を定義したりすることはできないようです。
しかし、JPA仕様の実装であるEclipseLinkとHibernateは、それぞれのJPQL拡張であるEQL（EclipseLink Query Language）とHQL（Hibernate Query Language）で、
開発者により広い可能性を提供しています。

それでは、顧客（1）-（N）注文という関係を持つ単純な店舗モデルを考えてみましょう。注文IDがわかっているとして、
データベースから単一のJPQLクエリを使用して、顧客とその特定の注文に関する情報だけを取得してみましょう。

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

クエリ結果を説明するために、以下のデータベース状態を仮定します。
```sql
[{Customer A, id=1, orders=[]},
 {Customer B, id=2, orders=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

## 条件付きEQL JOIN FETCH

EclipseLinkでは、JOIN FETCHの場合、ON句で条件を使用することも、JOINエイリアスを参照してWHERE句で
そのような条件を定義することも可能です。

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

EclipseLinkは以下のSQLクエリを生成します。

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### キャッシュ

EclipseLinkがフィルタリングされた注文リストを持つ顧客`[{Customer B, id = 2, orders = [10]}]`を返すか、
またはその顧客のすべての注文を持つ`[{Customer B, id = 2, orders = [10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]`を返すかは、
キャッシュ設定に依存します。[JPQL EclipseLinkドキュメント](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL)に
以下の注記があるのには理由があります。

> JOIN FETCHは通常エイリアスを許可しませんが、EclipseLink 2.4以降ではエイリアスが許可されています。エイリアスは注意して使用する必要があります。結果として得られるオブジェクトの構築方法に影響を与える可能性があるためです。オブジェクトは通常、どのようにクエリされたかに関わらず、常に同じデータを持つべきです。これはキャッシングと一貫性にとって重要です。<br/>これは、エイリアスがWHERE句でコレクションリレーションシップに使用され、フェッチされる関連オブジェクトをフィルタリングする場合にのみ問題となります。これはすべきではありませんが、望ましい場合もあり、その場合はクエリがキャッシュをBYPASSするように設定されていることを確認する必要があります。

例えば、同じトランザクションで以前にデータベースから顧客を取得した場合`SELECT c FROM Customers c WHERE c.id = 2`、
そしてオブジェクトが第一レベルキャッシュ（*EntityManager*）に登録されていた場合、または第二レベルキャッシュ（*EntityManagerFactory*）が有効で、
別のトランザクションの結果としてオブジェクトがそこに追加されていた場合、顧客の注文の完全なリストを受け取ります。

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="JPA L1およびL2キャッシュ" title="JPA L1およびL2キャッシュ">

特定の注文を持つリストを受け取りたい場合は、EclipseLinkにL1とL2の両方のキャッシュをスキップするようにヒントを*Query*型オブジェクトに追加します：`query.setHint("eclipselink.maintain-cache", "false")`。これにより、ELはクエリ結果から直接オブジェクトを構築し、JPAの観点から一貫性のないオブジェクトでコンテキストを汚染しません。

### Distinct

条件を適用した後、1つではなくN個の関連エンティティをフェッチすることを期待する場合は、DISTINCT句を使用する必要があります。

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **注:** DISTINCT句に括弧を使用しないように注意してください（例：DISTINCT(c)）。EclipseLinkはこれに敏感で、かなり疑わしいクエリを生成し、ON句の場合は条件をドロップするまでに至ります。
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## 条件付きHQL JOIN FETCH

EclipseLinkと同様に、Hibernateもエイリアスを参照して条件を定義することをサポートしています。

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

しかし、ON句でそのような条件を定義することは禁止されています。

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### キャッシュ

Hibernateの場合も、キャッシュの問題を考慮に入れる必要があります。L1キャッシュを汚染しないようにするための一つの選択肢は、
同じ接続を再利用して別の[ステートレスセッション](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html)を作成することです。
このようなセッションはL1キャッシュを実装せず、L2キャッシュと相互作用しません。
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

同様に、条件を適用した後に1つではなくN個の関連エンティティをフェッチすることを期待する場合は、DISTINCT句を追加する必要があります。

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

これにより、親（この場合は顧客）レベルでのオブジェクトの重複の問題を排除します。
```sql
--Distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]}]
--Without distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]},
 {Customer B, id=5, orders=[10, 49]}]
```

「*hibernate.query.passDistinctThrough*」ヒントに「*false*」値を適用することで、
SQLクエリからDISTINCT句を取り除くこともできます。データベースは少し楽になり、Hibernateも重複排除を忘れません。

## まとめ

JPA仕様ではJOIN FETCH句で関連エンティティに条件を追加することは許可されていませんが、
EclipseLinkとHibernateの両方はそのような可能性を提供しています。
しかし、どちらの場合も、そのようなクエリを構築する際には注意が必要で、キャッシュや返されるオブジェクトの重複に関する問題を考慮に入れる必要があります。
これは、結果を管理対象オブジェクトとして必要とするかどうかによっても重要になります。
