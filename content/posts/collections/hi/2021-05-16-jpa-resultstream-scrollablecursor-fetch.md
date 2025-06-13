---
title: CursoredStream/ScrollableCursor के साथ JPQL JOIN FETCH
url: jpql-join-fetch-distinct-cursoredstream-scrollablecursor
id: 66
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - इक्लिप्सलिंक
  - हाइबरनेट
author: Damian Terlecki
date: 2021-05-16T20:00:00
---

JPA 2.2 में, *javax.persistence.Query* इंटरफ़ेस में एक नई विधि जोड़ी गई है, `Stream getResultStream()`, जो स्ट्रीम प्रोसेसिंग के आसान कार्यान्वयन की अनुमति देती है। हालांकि, डिज़ाइन के अनुसार, यह विधि कैसे लागू की जाती है, यह JPA प्रदाता के विवेक पर छोड़ दिया गया है। हालांकि, अक्सर, यह `Query.getResultList()` द्वारा लौटाई गई सूची पर `stream()` विधि का एक मंगलाचरण मात्र है:

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

बड़ी संख्या में रिकॉर्ड संसाधित करने के लिए एक समाधान की तलाश में, एक परिमित क्षेत्र के साथ मेमोरी को ध्यान में रखते हुए, पूरी सूची को लोड करना सबसे अच्छा विचार नहीं हो सकता है। इस उद्देश्य के लिए, कर्सर एक आदर्श विकल्प हैं। जिसका उचित उपयोग मेमोरी उपयोग को अपेक्षाकृत निम्न स्तर तक कम करने की अनुमति देता है। ऐसे कर्सर के उदाहरण हैं:
- *org.eclipse.persistence.queries.CursoredStream* – EclipseLink में कर्सर;
- *org.eclipse.persistence.queries.ScrollableCursor* – EclipseLink में बहु-दिशात्मक कर्सर;
- *org.hibernate.ScrollableResults* – Hibernate में कर्सर।

यह मानते हुए कि हमें अपनी प्रसंस्करण के लिए कई तालिकाओं से संस्थाओं को लाने की आवश्यकता है, विकल्पों में से एक JPQL ऑपरेटर `[LEFT [OUTER] | INNER] JOIN FETCH join_association_path_expression` का उपयोग करना है। JOIN FETCH आपको N+1 समस्या से छुटकारा पाने की अनुमति देता है, जिसमें हमें अभी भी मूल एक के लिए प्रत्येक संबंधित इकाई को लाना होगा। हम इसे कैसे हल करते हैं, यह अंत में हमारे एप्लिकेशन के प्रदर्शन को प्रभावित करेगा।

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

मूल रूप से, EclipseLink में JOIN FETCH के अलावा हम दो अन्य समाधानों में से एक भी चुन सकते हैं [(BatchFetchType EXISTS और IN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html), जो जटिल संबंधों के लिए इष्टतम हैं। प्रत्येक संबंध के लिए एक अतिरिक्त क्वेरी (IN/EXISTS) के बदले में, EL को जॉइन से उत्पन्न होने वाले डुप्लिकेट रिकॉर्ड को संसाधित करने की आवश्यकता नहीं है। हालांकि, ये विकल्प कर्सर के मामले में बहुत अच्छी तरह से काम नहीं करते हैं, जहां हमें आमतौर पर प्रत्येक बाद के ऑब्जेक्ट को प्राप्त करने के बाद संबंधित डेटा पुनर्प्राप्त करना होता है। इस मामले में, EXISTS और IN के साथ समाधान शुरुआती बिंदु पर वापस आ जाता है।


जैसा कि आप देख सकते हैं, डुप्लीकेट JOIN FETCH के साथ एक समस्या है। एक साधारण दुकान मॉडल दिया गया है: ग्राहक (1) -> (N) ऑर्डर और ऐसी (**@OneToMany**) संबंध वाली इकाई के लिए JPQL क्वेरी:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
हम उम्मीद कर सकते हैं कि EclipseLink एक एकल SQL क्वेरी उत्पन्न करेगा:
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
और उन ग्राहकों की डुप्लिकेट सूची की उम्मीद करें जिन्होंने कई ऑर्डर दिए हैं:
```sql
[{ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक B, id=2, ऑर्डर=[10, 14, 18, 46, 47, 48]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]},
 {ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]}]
```

### JPQL DISTINCT SELECT

JPQL में दोहराव की समस्या का समाधान इकाई पर ही DISTINCT ऑपरेटर का उपयोग करना है:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```
इस तरह, एक क्वेरी के साथ, हमें ग्राहकों की उनके ऑर्डर के साथ डी-डुप्लीकेटेड सूची मिलती है:
```sql
[{ग्राहक C, id=3, ऑर्डर=[38, 42, 52, 53, 54, 34]},
 {ग्राहक B, id=2, ऑर्डर=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
इसका एक साइड इफेक्ट उत्पन्न SQL क्वेरी में DISTINCT ऑपरेटर को जोड़ना भी है। हाइबरनेट इस समस्या से निपटने के लिए उपयोगकर्ता को [*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/) हिंट प्रदान करता है, जबकि EclipseLink में मुझे ऐसा कोई समकक्ष नहीं मिला।

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor DISTINCT SELECT

DISTINCT ऑपरेटर के बारे में ज्ञान को *CursoredStream* कर्सर पर भी लागू करने पर, हम थोड़ा आश्चर्यचकित हो सकते हैं।

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

उपरोक्त कोड नीचे दिए गए परिणामों के समान परिणाम उत्पन्न कर सकता है:
```java
{ग्राहक B, id=2, ऑर्डर=[10]}
{ग्राहक B, id=2, ऑर्डर=[10]}
{ग्राहक B, id=2, ऑर्डर=[10]}
{ग्राहक C, id=3, ऑर्डर=[34, 38, 42, 52, 53, 54]}
{ग्राहक B, id=2, ऑर्डर=[10]}
/**/
```

हालांकि, DISTINCT के बिना भी, हम अभी भी भाग्यशाली हो सकते हैं और डी-डुप्लीकेटेड रिकॉर्ड प्राप्त कर सकते हैं। ऐसा क्यों है? जिस मूल सिद्धांत पर *CursoredStream/ScrollableCursor* में डी-डुप्लीकेशन किया जाता है, वह क्वेरी से लौटाए गए बाद के पंक्तियों में प्राथमिक कुंजी मानों का क्रम है। यदि डेटाबेस समान प्राथमिक कुंजी वाली पंक्तियों को परिणाम सेट के चारों ओर बिखेर कर लौटाता है, तो EclipseLink उन्हें अलग-अलग ऑब्जेक्ट के रूप में संसाधित करेगा।

समस्या को हल करने के लिए, हमें बस सॉर्ट क्रम निर्दिष्ट करने की आवश्यकता है:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```
इस तरह हमें `getResultList()` के साथ समान परिणाम मिलता है:
```java
{ग्राहक B, id=2, ऑर्डर=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{ग्राहक C, id=3, ऑर्डर=[42, 52, 53, 54, 34, 38]}
```

अंत में, हमारे कर्सर को अनुकूलित करना भी सार्थक है:
- *QueryHints.SCROLLABLE_CURSOR* – आपको इसके बजाय स्क्रॉलेबलकर्सर का उपयोग करने की अनुमति देता है (पीछे की ओर बढ़ सकता है);
- *QueryHints.RESULT_SET_TYPE* – कर्सर की दिशा को परिभाषित करता है;
- *QueryHints.RESULT_SET_CONCURRENCY* – पढ़ने के लिए अनुकूलन सक्षम करता है;
- *QueryHints.CURSOR_INITIAL_SIZE* – कर्सर के पहले पृष्ठ के लिए पूर्व-निर्मित ऑब्जेक्ट की संख्या को कॉन्फ़िगर करता है;
- *QueryHints.CURSOR_PAGE_SIZE* – बफर खाली होने पर प्राप्त की गई ऑब्जेक्ट की संख्या (`next()` विधि) को परिभाषित करता है;
- *QueryHints.READ_ONLY* – सक्षम किया जाता है जब परसिस्टेंस कॉन्टेक्स्ट में पंजीकरण की आवश्यकता नहीं होती है (मेमोरी की खपत कम करता है)।

