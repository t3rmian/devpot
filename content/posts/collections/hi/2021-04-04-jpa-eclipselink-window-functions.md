---
title: JPA (EclipseLink) विंडो फ़ंक्शंस
url: jpa-eclipselink-विंडो-फ़ंक्शंस
id: 63
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - इक्लिप्सलिंक
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

डेटाबेस विंडो फ़ंक्शंस विश्लेषणात्मक फ़ंक्शंस का एक समूह है जो आपको कुछ रुझानों के बारे में जानकारी प्रस्तुत करने वाली विस्तृत रिपोर्ट बनाने की अनुमति देता है। ऐसे फ़ंक्शन का एक उदाहरण किसी दिए गए समूह का योग हो सकता है:
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```

जबकि JPA इस उद्देश्य के लिए एक आदर्श उपकरण नहीं है, हमें फिर भी इस तकनीक पर आधारित मौजूदा एप्लिकेशन ढांचे में इस सुविधा का उपयोग करने की आवश्यकता हो सकती है। जबकि JPA विनिर्देश स्वयं ऐसे तरीके प्रदान नहीं करता है, जो हमें नेटिव क्वेरी पर वापस जाने के लिए मजबूर करता है, इसके व्यक्तिगत कार्यान्वयन हमें कुछ शक्तिशाली एक्सटेंशन देते हैं।

EclipseLink का उपयोग करके ऐसी क्वेरी को विंडो फ़ंक्शन के साथ कैसे बनाया जाए? इसे समझाने के लिए, मैं [MySQL डेटाबेस प्रलेखन](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html) से एक नमूने का उपयोग करूंगा। आइए एक साधारण तालिका से शुरू करें और इसे डेटा से भरें:

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

इसके बाद, हम तालिका को एक JPA इकाई में मैप करेंगे:

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

और अब हम अपने फ़ंक्शन को लागू करना शुरू कर सकते हैं। EclipseLink आपको *ExpressionOperator* क्लास में एक चयनित पूर्णांक के तहत उन्हें पंजीकृत करके अपने स्वयं के ऑपरेटर और फ़ंक्शन को परिभाषित करने की अनुमति देता है। अपना स्वयं का फ़ंक्शन जोड़ते समय, उपयोग की गई संख्याओं को एक ही स्थान पर घोषित करना उचित है:

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

इसके बाद, ExpressionOperator ऑब्जेक्ट का एक उदाहरण बनाकर, हम अपने फ़ंक्शन के तर्कों और लक्ष्य वर्ग को परिभाषित करते हैं। लक्ष्य वर्ग के लिए, हम EclipseLink द्वारा *ClassConstants* क्लास में पहले से परिभाषित विकल्पों में से एक चुन सकते हैं। मानक विकल्प *FunctionExpression* है, लेकिन हम *ArgumentListFunctionExpression* का भी उपयोग कर सकते हैं यदि हमारे फ़ंक्शन में तर्कों की एक गतिशील संख्या है (उदाहरण के लिए, पहले से परिभाषित *COALESCE* फ़ंक्शन):

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

यह ठीक है अगर हम अपना फ़ंक्शन एक बार जोड़ते हैं, जैसे कि जब क्लास लोड हो, एक स्थैतिक ब्लॉक में। हालाँकि, यदि हमें अलग-अलग डेटाबेस के लिए अलग-अलग कार्यान्वयन की आवश्यकता है, तो सेटअप अलग दिखेगा।

ऐसे मामले में, आपको *DatabasePlatform* से विरासत में मिली EclipseLink क्लास ढूंढनी चाहिए, जो आपके लक्षित डेटाबेस के कार्यों को लागू करती है। फिर इस क्लास का विस्तार करके, ओवरराइड किए गए *initializePlatformOperators()* विधि में अपना स्वयं का ऑपरेटर जोड़ें और *persistence.xml* फ़ाइल में नव परिभाषित प्लेटफ़ॉर्म चुनें:

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

अंत में, हम JPA EclipseLink एक्सटेंशन के माध्यम से अपने नए फ़ंक्शन का उपयोग कर सकते हैं। JPA *CriteriaBuilder* इंटरफ़ेस से शुरू करके, इसे EclipseLink *JpaCriteriaBuilder* इंटरफ़ेस में कास्ट करें। फिर नए फ़ंक्शन के लिए तर्क बनाने के लिए इसका उपयोग करें और इसे JPA-संगत इंटरफ़ेस से बदलें। फ़ंक्शन स्वयं *ExpressionBuilder* क्लास का उपयोग करके पहले से पंजीकृत पूर्णांक को संदर्भित करके बनाया जा सकता है:

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

अंत में, परिणाम MySQL प्रलेखन के उदाहरण के समान होने चाहिए:

<img src="/img/hq/jpa-window-functions.png" alt="विंडो फ़ंक्शन का परिणाम दिखाने वाला स्क्रीनशॉट" title="EclipseLink – एक विंडो फ़ंक्शन का परिणाम">

JPQL के मामले में, `SQL` ऑपरेटर के कारण समाधान उतना ही सरल है:
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

`SQL` ऑपरेटर EclipseLink *Expression* क्लास में एक विधि के रूप में भी उपलब्ध है। आप इसे फ़ंक्शन को पंजीकृत करने की आवश्यकता के बिना भी उपयोग कर सकते हैं (एक सरल [`FUNC`/`FUNCTION` ऑपरेटर](https://www.eclipse.org/eclipselink/documentation/3.0/jpa/extensions/jpql.htm#CIHCCHIC) के समान)। अंत में, `ExpressionOperator.registerOperator(int selector, String name)` के माध्यम से विशिष्ट नाम के तहत पंजीकृत कार्यों का उपयोग करने के लिए `OPERATOR` सिंटैक्स देखें।
