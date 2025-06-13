---
title: शर्त के साथ JPQL JOIN FETCH
url: jpql-join-fetch-शर्त-के-साथ
id: 67
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - इक्लिप्सलिंक
  - हाइबरनेट
author: Damian Terlecki
date: 2021-05-30T20:00:00
---

JPQL (जावा परसिस्टेंस क्वेरी लैंग्वेज) क्वेरी बनाने से संबंधित दिलचस्प मामलों में से एक JOIN FETCH क्लॉज का उपयोग करते समय संबंधित एंटिटी को फ़िल्टर करने की संभावना है। JPA स्पेसिफिकेशन संस्करण 2.2 ([JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf)) JOIN और JOIN FETCH का उपयोग करके JPQL क्वेरी के लिए निम्नलिखित सिंटैक्स को परिभाषित करता है।

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

इससे, हम देख सकते हैं कि JOIN FETCH के मामले में, एक उपनाम देना या अतिरिक्त जॉइन शर्तों को परिभाषित करना संभव नहीं है। फिर भी, EclipseLink और Hibernate दोनों JPA स्पेसिफिकेशन के कार्यान्वयन के रूप में, अपने JPQL एक्सटेंशन में - क्रमशः EQL (EclipseLink Query Language) और HQL (Hibernate Query Language) डेवलपर्स को संभावनाओं की एक विस्तृत श्रृंखला देते हैं।

तो चलिए एक दुकान का एक सरल मॉडल लेते हैं जिसमें हमारे पास एक ग्राहक (1) - (N) ऑर्डर संबंध है। ऑर्डर आईडी जानते हुए, आइए डेटाबेस से एक ही JPQL क्वेरी का उपयोग करके ग्राहक और केवल उस विशिष्ट ऑर्डर के बारे में जानकारी प्राप्त करने का प्रयास करें।

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

क्वेरी परिणामों को स्पष्ट करने के लिए, आइए निम्नलिखित डेटाबेस स्थिति मान लें:
```sql
[{ग्राहक A, id=1, ऑर्डर्स=[]},
 {ग्राहक B, id=2, ऑर्डर्स=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {ग्राहक C, id=3, ऑर्डर्स=[34, 38, 42, 52, 53, 54]}]
```

## शर्त के साथ EQL JOIN FETCH

EclipseLink JOIN FETCH के मामले में ON क्लॉज में एक शर्त का उपयोग करने और JOIN उपनाम को संदर्भित करके WHERE क्लॉज में ऐसी शर्त को परिभाषित करने दोनों की अनुमति देता है।

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

EclipseLink निम्नलिखित SQL क्वेरी उत्पन्न करेगा:

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### कैश

क्या EclipseLink एक ग्राहक को फ़िल्टर की गई ऑर्डर सूची `[{Customer B, id = 2, orders = [10]}]` के साथ लौटाएगा या इस ग्राहक के सभी ऑर्डर `[{Customer B, id = 2, orders = [10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]` के साथ, यह कैश सेटिंग्स पर निर्भर करता है। एक कारण है कि [JPQL EclipseLink प्रलेखन](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL) में, निम्नलिखित नोट पाया जा सकता है:

> JOIN FETCH सामान्य रूप से एक उपनाम की अनुमति नहीं देता है, लेकिन EclipseLink 2.4 के अनुसार एक उपनाम की अनुमति है। उपनाम का उपयोग सावधानी से किया जाना चाहिए, क्योंकि यह परिणामी वस्तुओं के निर्माण को प्रभावित कर सकता है। वस्तुओं में सामान्य रूप से हमेशा समान डेटा होना चाहिए, चाहे वे कैसे भी क्वेरी किए गए हों, यह कैशिंग और स्थिरता के लिए महत्वपूर्ण है।<br/>यह केवल एक मुद्दा है यदि उपनाम का उपयोग WHERE क्लॉज में एक संग्रह संबंध पर संबंधित वस्तुओं को फ़िल्टर करने के लिए किया जाता है जिन्हें लाया जाएगा। ऐसा नहीं किया जाना चाहिए, लेकिन कभी-कभी वांछनीय होता है, जिस स्थिति में क्वेरी को यह सुनिश्चित करना चाहिए कि इसे कैश को बायपास करने के लिए सेट किया गया है।

उदाहरण के लिए, यदि एक ही लेनदेन में हमने पहले अपने क्लाइंट को डेटाबेस से `SELECT c FROM Customers c WHERE c.id = 2` लाया था और ऑब्जेक्ट को पहले स्तर के कैश (*EntityManager*) में पंजीकृत किया गया था; या हमने दूसरे स्तर के कैश (*EntityManagerFactory*) को सक्षम किया है और ऑब्जेक्ट को दूसरे लेनदेन के परिणामस्वरूप वहां जोड़ा गया था, तो हमें ग्राहक के ऑर्डर की पूरी सूची प्राप्त होगी।

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="JPA L1 और L2 कैश" title="JPA L1 और L2 कैश">

यदि आप विशिष्ट ऑर्डर के साथ एक सूची प्राप्त करना चाहते हैं, तो इस मामले में, *Query* प्रकार के ऑब्जेक्ट में EclipseLink के लिए L1 और L2 दोनों कैश को छोड़ने के लिए एक संकेत जोड़ें: `query.setHint("eclipselink.maintain-cache", "false")`। इस तरह EL सीधे क्वेरी परिणामों से ऑब्जेक्ट का निर्माण करेगा और JPA दृष्टिकोण से एक असंगत ऑब्जेक्ट के साथ संदर्भ को प्रदूषित नहीं करेगा।

### डिस्टिंक्ट (Distinct)

यदि, शर्त लागू करने के बाद, हम एक नहीं, बल्कि N संबंधित एंटिटी लाने की उम्मीद करते हैं, तो हमें DISTINCT क्लॉज का उपयोग करना चाहिए:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **ध्यान दें:** सावधान रहें कि DISTINCT क्लॉज के साथ कोष्ठक का उपयोग न करें जैसे: DISTINCT(c)। EclipseLink इसके प्रति संवेदनशील है और काफी संदिग्ध क्वेरी उत्पन्न करेगा, यहाँ तक कि ON क्लॉज के मामले में शर्त को छोड़ने तक:
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## शर्त के साथ HQL JOIN FETCH

EclipseLink के समान, Hibernate भी एक उपनाम को संदर्भित करके एक शर्त को परिभाषित करने का समर्थन करता है:

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

हालाँकि, ON क्लॉज में ऐसी शर्त को परिभाषित करना निषिद्ध है:

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### कैश

Hibernate के मामले में भी, हमें संभावित कैश समस्याओं को ध्यान में रखना होगा। L1 कैश को अव्यवस्थित न करने के लिए, एक विकल्प एक ही कनेक्शन का पुन: उपयोग करके एक अलग [स्टेटलेस सत्र](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html) बनाना है। ऐसा सत्र L1 कैश को लागू नहीं करता है और L2 कैश के साथ इंटरैक्ट नहीं करता है:
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

### डिस्टिंक्ट (Distinct)

इसी तरह, यदि शर्त लागू करने के बाद हम एक नहीं, बल्कि N संबंधित एंटिटी लाने की उम्मीद करते हैं, तो हमें DISTINCT क्लॉज जोड़ना चाहिए:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

इस तरह, हम पैरेंट (इस मामले में, क्लाइंट) स्तर पर डुप्लिकेट ऑब्जेक्ट की समस्या को समाप्त करते हैं:
```sql
--डिस्टिंक्ट के साथ:
[{ग्राहक B, id=5, ऑर्डर्स=[10, 49]},
 {ग्राहक C, id=6, ऑर्डर्स=[34]}]
--डिस्टिंक्ट के बिना:
[{ग्राहक B, id=5, ऑर्डर्स=[10, 49]},
 {ग्राहक C, id=6, ऑर्डर्स=[34]},
 {ग्राहक B, id=5, ऑर्डर्स=[10, 49]}]
```

"*hibernate.query.passDistinctThrough*" हिंट को "*false*" मान के साथ लागू करने के माध्यम से, हम SQL क्वेरी से DISTINCT क्लॉज से भी छुटकारा पा सकते हैं। डेटाबेस को थोड़ी राहत मिलेगी, और Hibernate भी डी-डुप्लीकेशन के बारे में नहीं भूलेगा।

## सारांश

जबकि JPA स्पेसिफिकेशन JOIN FETCH क्लॉज में संबंधित एंटिटी पर शर्तें जोड़ने की अनुमति नहीं देता है, EclipseLink और Hibernate दोनों ऐसी संभावना प्रदान करते हैं। दोनों ही मामलों में, हालांकि, हमें ऐसी क्वेरी बनाते समय सावधान रहना चाहिए और कैश और लौटाए गए ऑब्जेक्ट के दोहराव के साथ संभावित समस्याओं को ध्यान में रखना चाहिए। यह इस बात पर भी निर्भर करेगा कि आपको परिणाम प्रबंधित वस्तुओं के रूप में चाहिए या नहीं।
