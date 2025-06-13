---
title: JPA (EclipseLink) CriteriaBuilder में नेटिव SQL
url: jpa-criteriabuilder-नेटिव-sql-eclipselink
id: 64
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - इक्लिप्सलिंक
author: Damian Terlecki
date: 2021-04-18T20:00:00
---

JPA CriteriaBuilder का उपयोग करते समय, देर-सबेर आप कुछ सीमाओं का सामना करेंगे जो स्पेसिफिकेशन से उत्पन्न होती हैं। इसका एक उदाहरण सबक्वेरी में लौटाए गए परिणामों की अधिकतम संख्या को सीमित करना, या NULL मानों के सॉर्ट ऑर्डर को बदलना हो सकता है। EclipseLink, Hibernate के विकल्प के रूप में, *JpaCriteriaBuilder* इंटरफ़ेस और *ExpressionBuilder* क्लास के रूप में काफी अच्छा एब्स्ट्रैक्शन प्रदान करता है।

## TOP N क्वेरी

TOP N क्वेरी एक मानक क्वेरी है जिसमें हम डेटाबेस से N रिकॉर्ड प्राप्त करना चाहते हैं, जो अक्सर हमारे लिए रुचि के किसी गुण के अनुसार क्रमबद्ध होते हैं। उदाहरण के लिए, हम 5 सर्वश्रेष्ठ-रेटेड उत्पादों का पता लगाना चाह सकते हैं (H2 डेटाबेस सिंटैक्स):

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 5;
```

हम आसानी से *CriteriaBuilder* क्लास का उपयोग करके ऐसी क्वेरी बना सकते हैं (वास्तव में `CriteriaQuery.orderBy()` और `Query.setMaxResults()` के माध्यम से), जिसका संदर्भ हम *EntityManager* से प्राप्त करते हैं। यदि हम उन्हें सब-क्वेरी के रूप में रखना चाहते हैं, तो मामला अधिक जटिल हो जाता है।

JPA 2.2 का वर्तमान संस्करण हमें ऐसी संभावना प्रदान नहीं करता है। हम, निश्चित रूप से, अपनी समस्या को दो क्वेरी में तोड़ सकते हैं या एक नेटिव समाधान पर विचार कर सकते हैं। हालाँकि, EclipseLink हमें *ExpressionBuilder* क्लास प्रदान करता है, जो इस स्थिति में सहायक है।

ExpressionBuilder एक क्लास है जिसका उपयोग EclipseLink के आंतरिक घटकों द्वारा किया जाता है। क्लाइंट के दृष्टिकोण से जो महत्वपूर्ण है, वह यह है कि यह एक्सप्रेशन प्रकार की वस्तुओं को लौटाता है जो CriteriaBuilder इंटरफ़ेस से मेल खाती हैं। इसके अलावा, इस क्लास की एक विशेष रूप से उपयोगी विधि `public Expression sql(String sql, List arguments)` है।

पहले पैरामीटर के रूप में, हम एक नेटिव SQL क्वेरी प्रदान कर सकते हैं। विधि के दूसरे पैरामीटर के माध्यम से, हम तर्कों को इंजेक्ट कर सकते हैं। फ़ंक्शन एक ऑब्जेक्ट लौटाएगा जिसे हम उद्देश्य के आधार पर उपयोग कर सकते हैं - सब-क्वेरी, शर्त, या विशेषताओं की सूची के रूप में।

## CriteriaBuilder – TOP N सबक्वेरी

एक साधारण दुकान की कल्पना करें - कुछ ग्राहक, ऑर्डर और उत्पाद। मान लीजिए कि आप उन सभी ग्राहकों को खोजना चाहते हैं जिन्होंने तीन सबसे कम रेटेड उत्पादों में से एक का ऑर्डर दिया है। शायद आप उन्हें छूट देना चाहेंगे ताकि आपकी दुकान नकारात्मक विचारों से न जुड़ी हो। ऐसी दुकान का एक सरलीकृत क्लास आरेख इस तरह दिख सकता है:

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="TOP N क्वेरी सैंपल के लिए क्लास डायग्राम" title="सरलीकृत क्लास डायग्राम">

अपेक्षित TOP N क्वेरी जिसे हम *CriteriaBuilder* से उत्पन्न करना चाहते हैं, वह है:

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

हम *EntityManager* से शुरू करेंगे, जिसे आप शायद पसंदीदा प्लेटफॉर्म के आधार पर इंजेक्ट करेंगे। फिर *ExpressionBuilder* का उपयोग सबसे नेस्टेड क्वेरी में किया जाएगा:

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

हो गया! ध्यान दें कि sql विधि पहले प्रतिस्थापन के लिए बिल्डर में पहले से मौजूद एक अभिव्यक्ति का चयन करेगी, जैसा कि उदाहरण में दिखाया गया है। यह विशेष रूप से तब सहायक होता है जब आप क्वेरी के अंत में नेटिव भाग जोड़ना चाहते हैं।

पैरामीटर के रूप में *Path* प्रकार की वस्तुओं को निर्दिष्ट करके, हमें अपेक्षित परिणाम भी नहीं मिलेगा, क्योंकि डेटाबेस कॉलम नाम प्रतिस्थापन के बजाय उन पर `toString()` विधि को कॉल किया जाएगा। अंत में, आप शायद इस मार्ग को तब तक नहीं चुनेंगे जब तक कि आप एक जटिल API मानदंड समर्थन लागू नहीं कर रहे हों।

