---
title: EclipseLink JPQL के साथ लॉकिंग विकल्पों का विस्तार
url: eclipselink-विस्तारित-लॉकिंग-विकल्प
id: 82
category:
- jpa: जेपीए
tags:
- एसक्यूएल
- ओरेकल
- प्रदर्शन
- इक्लिप्सलिंक
author: Damian Terlecki
date: 2022-03-20T20:00:00
---

JPA स्पेसिफिकेशन केवल एंटिटी लॉकिंग विकल्पों के एक सामान्य सबसेट की अनुमति देता है जो आमतौर पर डेटाबेस में लागू होते हैं। जब एक अधिक विशिष्ट लॉकिंग विकल्प चुनने की आवश्यकता का सामना करना पड़ता है, तो आपको नेटिव क्वेरीज़ पर वापस जाना होगा। लेकिन जब आपके पास पहले से ही कुछ जटिल JPQL कोड है, तो क्या विक्रेता-विशिष्ट लॉकिंग को नियोजित करने का कोई तरीका नहीं है?

EclipseLink *org<wbr>.eclipse<wbr>.persistence<wbr>.internal<wbr>.databaseaccess<wbr>.DatabasePlatform* क्लास के तहत डेटाबेस-विशिष्ट व्यवहार को लागू करता है। मानक पैकेज के भीतर, आपको MySQL, PostgreSQL, Oracle, और कई अन्य जैसे कई अलग-अलग प्लेटफॉर्म मिलेंगे। जब भी क्वेरी बिल्डिंग के लिए कुछ कस्टम व्यवहार की आवश्यकता होती है, तो बिल्डर प्लेटफॉर्म कार्यान्वयन को कॉल करता है। स्टैक ट्रेस का पालन करके, आप आसानी से क्वेरी के लॉकिंग हिस्से के निर्माण के लिए उपयोग किए जाने वाले बिंदु और इंटरफ़ेस को ढूंढ लेंगे, जो जैसा कि आप उम्मीद कर सकते हैं, अभी भी डेटाबेस के बीच भिन्न है।

आइए देखें कि EclipseLink इसे कैसे संभालता है। हम Oracle-विशिष्ट `SELECT FOR UPDATE OF` और `SKIP LOCKED` क्लॉज़ के साथ लॉकिंग का विस्तार करने का प्रयास करेंगे।

## JPQL SELECT FOR UPDATE OF / SKIP LOCKED

क्वेरी के कार्यान्वयन में जाने के लिए, हम इसे आंतरिक इंटरफ़ेस पर अनरैप कर सकते हैं। EclipseLink में ऑब्जेक्ट्स का उपयोग करने वाली सभी रीड क्वेरीज़ *ObjectLevelReadQuery* क्लास का उपयोग करती हैं। हालांकि, अंतर्निहित क्वेरी के साथ छेड़छाड़ शुरू करने से पहले EclipseLink के आंतरिक के बारे में एक बात पर ध्यान दें। क्वेरीज़ साझा की जा सकती हैं। साइड इफेक्ट्स को रोकने के लिए, रीड क्वेरी को क्लोन करें और रैपर में रेफरेंस को अपडेट करें।

```java
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;
import org.eclipse.persistence.internal.jpa.QueryImpl;
import org.eclipse.persistence.queries.ObjectLevelReadQuery;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {

    //...
    
    private ExpressionBuilder clone(Query query) {
        QueryImpl queryImpl = query.unwrap(QueryImpl.class);
        ObjectLevelReadQuery objectLevelReadQuery = (ObjectLevelReadQuery) query
                .unwrap(ObjectLevelReadQuery.class).clone();
        queryImpl.setDatabaseQuery(objectLevelReadQuery);
        objectLevelReadQuery.setLockingClause(this);
        return objectLevelReadQuery.getExpressionBuilder();
    }
}
```

*ObjectLevelReadQuery* का इंटरफ़ेस लॉकिंग क्लॉज़ डालने का एक तरीका प्रदान करता है। यह क्लॉज़ एक तरह का बिल्डर इंटरफ़ेस है जो लॉकिंग भाग को प्रिंट करता है। डिफ़ॉल्ट रूप से, *ForUpdateClause* का उपयोग यहां किया जाता है। यह कार्यान्वयन मानक लॉक, एक प्रतीक्षा टाइमआउट, और एक नो-वेट क्लॉज़ का समर्थन करता है।

इसके अलावा, हमारे पास *ForUpdateOfClause* है। यह, हालांकि, प्रतीक्षा और नो-वेट क्लॉज़ का समर्थन नहीं करता है, लेकिन `LOCK FOR <column>` क्लॉज़ को लागू करता है। इस क्लास का विस्तार करके, आप `SKIP LOCKED` क्लॉज़ के लिए भी समर्थन जोड़ सकते हैं।

```java
import org.eclipse.persistence.internal.expressions.ExpressionSQLPrinter;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;
import org.eclipse.persistence.internal.expressions.SQLSelectStatement;
import org.eclipse.persistence.queries.ObjectBuildingQuery;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {
    public static final short LOCK_SKIP_LOCKED = Short.MAX_VALUE;

    private Integer waitTimeout;

    public OracleForUpdateOfClause() {
    }

    public OracleForUpdateOfClause(short lockMode) {
        setLockMode(lockMode);
    }

    public OracleForUpdateOfClause(Integer waitTimeout) {
        this.waitTimeout = waitTimeout;
        setLockMode(ObjectBuildingQuery.LOCK);
    }

    public void printSQL(ExpressionSQLPrinter printer, SQLSelectStatement statement) {
        super.printSQL(printer, statement);
        if (getLockMode() == ObjectBuildingQuery.LOCK && waitTimeout != null) {
            printer.printString(" WAIT " + waitTimeout);
        } else if (getLockMode() == LOCK_SKIP_LOCKED) {
            printer.printString(" SKIP LOCKED");
        }
    }
    
    //...
}
```

क्वेरी के विशेष संबंध से सही फ़ील्ड्स को संदर्भित करने के लिए, मैं क्वेरी बिल्डर में तैयार किए गए अभिव्यक्तियों का उपयोग करने का सुझाव देता हूं। यह परिणामी क्वेरी के लिए सही तालिका उपनाम का पता लगाने के प्रयास को कम करता है। अब आखिरी बात क्वेरी निष्पादन से पहले क्लॉज़ जोड़ना है।

```java
import org.eclipse.persistence.expressions.Expression;
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.internal.expressions.ForUpdateOfClause;

import javax.persistence.Query;

public class OracleForUpdateOfClause extends ForUpdateOfClause {
    
    //...

    public void selectQueryForUpdateOf(Query query) {
        ExpressionBuilder expressionBuilder = clone(query);
        getLockedExpressions().add(expressionBuilder);
    }

    public void selectQueryForUpdateOf(Query query, String ofRelation) {
        ExpressionBuilder expressionBuilder = clone(query);
        for (Expression expression : expressionBuilder.derivedExpressions) {
            if (ofRelation.equals(expression.getName())) {
                getLockedExpressions().add(expression);
                break;
            }
        }
    }

    //...
}
```

अंत में, यदि हम लॉगिंग चालू करके इस व्यवहार का परीक्षण करते हैं, तो आप नए लॉकिंग क्लॉज़ देखेंगे। अब आप इसकी तुलना सभी चयनित पंक्तियों के लॉकिंग से कर सकते हैं:

```java
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.LockModeType;
import javax.persistence.PersistenceException;
import javax.persistence.PersistenceUnit;
import javax.persistence.Query;
import java.util.function.Consumer;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class SelectForUpdateOfTest {

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;

    @Test
    public void testSelectForUpdate() {
        invokeInTransaction((entityManager) -> {
            entityManager.createQuery("SELECT s FROM Stock s JOIN FETCH s.product " +
                            "WHERE s.product.id = 1")
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getSingleResult();
            // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
            // FROM PRODUCT t0, STOCK t1
            // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id)) FOR UPDATE

            PersistenceException exception = Assertions.assertThrows(PersistenceException.class,
                    () -> invokeInTransaction((secondEntityManager) -> {
                Query query = secondEntityManager.createQuery("SELECT p FROM Product p " +
                        "WHERE p.id = 1");
                OracleForUpdateOfClause clause = new OracleForUpdateOfClause(5);
                clause.selectQueryForUpdateOf(query);
                query.getSingleResult();
                // SELECT ID, NAME FROM PRODUCT WHERE (ID = ?) FOR UPDATE OF ID WAIT 5
            }));

            assertThat(exception.getMessage(),
                    containsString("ORA-30006: resource busy; acquire with WAIT timeout expired"));
        });
    }

    private void invokeInTransaction(Consumer<EntityManager> transaction) {
        EntityManager em = entityManagerFactory.createEntityManager();
        em.getTransaction().begin();
        transaction.accept(em);
        em.getTransaction().commit();
    }
}
```

इसके बाद, समान जुड़े हुए परिणाम के लिए, आप एक क्वेरी में एक तालिका से पंक्तियों को और दूसरी क्वेरी में दूसरी तालिका से पंक्तियों को बिना किसी विवाद के लॉक कर सकते हैं। `SKIP LOCKED` भाग भी ठीक काम करता है:

```java
//...
@SpringBootTest
public class SelectForUpdateOfTest {

    //...

    @Test
    public void testSelectForUpdate_LockDifferentJoinedTables() {
        invokeInTransaction((entityManager) -> {
            Query query = entityManager.createQuery(
                    "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
            );
            OracleForUpdateOfClause clause = new OracleForUpdateOfClause(5);
            clause.selectQueryForUpdateOf(query, "product");
            query.getSingleResult();
            // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
            // FROM PRODUCT t0, STOCK t1
            // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id)) FOR UPDATE OF t0.ID WAIT 5

            invokeInTransaction((secondEntityManager) -> {
                Query secondQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause = new OracleForUpdateOfClause(5);
                secondClause.selectQueryForUpdateOf(secondQuery);
                secondQuery.getSingleResult();
                // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
                // FROM PRODUCT t0, STOCK t1
                // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
                // FOR UPDATE OF t1.ID WAIT 5
            });

            invokeInTransaction((secondEntityManager) -> {
                Query secondQuery = secondEntityManager.createQuery(
                        "SELECT s FROM Stock s JOIN FETCH s.product WHERE s.product.id = 1"
                );
                OracleForUpdateOfClause secondClause =
                        new OracleForUpdateOfClause(OracleForUpdateOfClause.LOCK_SKIP_LOCKED);
                secondClause.selectQueryForUpdateOf(secondQuery, "product");
                assertTrue(secondQuery.getResultList().isEmpty());
                // SELECT t1.ID, t1.TOTAL, t1.product_id, t0.ID, t0.NAME
                // FROM PRODUCT t0, STOCK t1
                // WHERE ((t1.product_id = ?) AND (t0.ID = t1.product_id))
                // FOR UPDATE OF t0.ID SKIP LOCKED
            });
        });
    }

}

```


<img src="/img/hq/eclipselink-extended-locking-options.png" alt="EclipseLink SELECT FOR UPDATE OF / SKIP LOCKED" title="EclipseLink SELECT FOR UPDATE OF / SKIP LOCKED">

