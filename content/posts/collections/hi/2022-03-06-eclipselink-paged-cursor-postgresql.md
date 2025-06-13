---
title: PostgreSQL कर्सर फेच साइज (EclipseLink JPA)
url: eclipselink-jpa-कर्सर-फेच-postgresql
id: 81
category:
- jpa: जेपीए
tags:
- एसक्यूएल
- पोस्टग्रेएसक्यूएल
- प्रदर्शन
- इक्लिप्सलिंक
author: Damian Terlecki
date: 2022-03-06T20:00:00
---

कर्सर किसी भी समय एक रिजल्ट सेट द्वारा उपयोग की जाने वाली मेमोरी की मात्रा को प्रबंधित करने का एक सुविधाजनक तरीका है। PostgreSQL के लिए JDBC ड्राइवर के मामले में, [अतिरिक्त आवश्यकताओं](https://jdbc.postgresql.org/documentation/head/query.html#:~:text=Note) को पूरा किया जाना चाहिए ताकि परिभाषित पेजिंग आकार के बावजूद पूरा डेटा सेट फेच न हो। यदि हम इसे अनदेखा करते हैं, तो हमारा एप्लिकेशन हमारी मंशा से कुछ GB अधिक डेटा ले सकता है।

## कर्सर रिजल्ट सेट

सबसे महत्वपूर्ण शर्तें यह हैं कि कर्सर को TYPE_FORWARD_ONLY के रूप में कॉन्फ़िगर किया जाना चाहिए और कनेक्शन ऑटो-कमिट मोड में नहीं होना चाहिए। JDBC इंटरफ़ेस को ही ध्यान में रखते हुए, इन आवश्यकताओं को पूरा करने में कोई समस्या नहीं है, लेकिन JPA के मामले में, यह अधिक जटिल है। आइए देखें कि EclipseLink का उपयोग करते समय क्या हो सकता है।

```java
import org.eclipse.persistence.config.HintValues;
import org.eclipse.persistence.config.QueryHints;
import org.eclipse.persistence.config.ResultSetType;
import org.eclipse.persistence.queries.Cursor;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.PersistenceContext;
import javax.persistence.PersistenceUnit;
import javax.persistence.Query;

public class ForwardCursorTest {
    @PersistenceContext
    private EntityManager entityManager;

    private Cursor getInternalPgResultSet() {
        Query usersQuery = entityManager.createQuery("SELECT u from User u")
                .setHint(QueryHints.RESULT_SET_TYPE, ResultSetType.ForwardOnly)
                .setHint(QueryHints.SCROLLABLE_CURSOR, HintValues.TRUE)
                .setHint(QueryHints.MAINTAIN_CACHE, HintValues.FALSE)
                .setHint(QueryHints.JDBC_FETCH_SIZE, FETCH_SIZE);

        return (Cursor) usersQuery.getSingleResult();
    }
}
```

JPA क्वेरी के लिए एक विशिष्ट कर्सर प्राप्त करने के लिए, मैं RESULT_SET_TYPE, SCROLLABLE_CURSOR, MAINTAIN_CACHE, और JDBC_FETCH_SIZE संकेतों का उपयोग करता हूं। उनके लिए धन्यवाद, EclipseLink क्वेरी परिणाम को एक पेजिनेटेड कर्सर के रूप में बनाएगा। इस बिंदु पर, हम बस परिणाम को इटेरेटर पर कास्ट कर सकते हैं, लेकिन कर्सर की आंतरिक स्थिति का परीक्षण करने के उद्देश्य से, मैं EclipseLink-विशिष्ट कर्सर इंटरफ़ेस का उपयोग करूंगा।

## कर्सर फेच साइज सत्यापन

ऐसी निर्मित क्वेरी में, हमारे पास `autocommit` प्रॉपर्टी को कॉन्फ़िगर करने का कोई तरीका नहीं है। JPA स्पेसिफिकेशन ऐसे इंटरफ़ेस को परिभाषित नहीं करता है। यह पैरामीटर मान सीमांकन और लेनदेन प्रकार (RESOURCE_LOCAL या JTA) के आधार पर नियंत्रित किया जाएगा। उदाहरण के लिए, हम आश्चर्यचकित हो सकते हैं कि केवल-पढ़ने वाले लेनदेन के लिए हमारा कर्सर पूरा डेटा सेट फेच करेगा:

```java
import org.eclipse.persistence.queries.Cursor;
import org.junit.jupiter.api.Test;
import org.postgresql.jdbc.PgResultSet;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

@SpringBootTest
public class ForwardCursorTest {

    private static final int FETCH_SIZE = 1;

    private interface Function<T, R, E extends Throwable> {
        R apply(T t) throws E;
    }
    
    private static int getConsuming(
            Cursor cursor,
            Function<PgResultSet, Integer, SQLException> getter
    ) throws SQLException {
        PgResultSet resultSet = cursor.getResultSet().unwrap(PgResultSet.class);
        Integer result = getter.apply(resultSet);
        cursor.close();
        return result;
    }

    //...

    @Test
    @Transactional(readOnly = true)
    public void testForwardCursorFetchSize_NonTransactional_ReadOnly() throws SQLException {
        Cursor cursor = getInternalPgResultSet();
        long fetchSize = getConsuming(cursor, PgResultSet::getLastUsedFetchSize);
        assertNotEquals(FETCH_SIZE, fetchSize);
        assertEquals(
                entityManager.createQuery("SELECT COUNT(u) FROM User u").getSingleResult(),
                fetchSize
        );
    }

    @Test
    public void testForwardCursorFetchSize_NonTransactional() throws SQLException {
        Cursor cursor = getInternalPgResultSet();
        assertNotEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
    }
}
```

केवल लेनदेन की वास्तविक शुरुआत के बाद ही हमें अपेक्षित कर्सर आकार मिलेगा। यह क्षण लेनदेन प्रबंधक के आधार पर भिन्न हो सकता है। डिफ़ॉल्ट रूप से, स्प्रिंग में, यह पहले संशोधन ऑपरेशन के दौरान होगा। यदि हम *EclipseLinkJpaDialect* कॉन्फ़िगरेशन को `lazyDatabaseTransaction` ध्वज को `false` पर सेट करके संलग्न करते हैं, तो केवल-पढ़ने के अलावा किसी भी मोड में कोई भी क्वेरी लेनदेन शुरू करेगी।

प्रबंधक की अनुपस्थिति में, `beginEarlyTransaction()` के माध्यम से उचित शुरुआत को लागू किया जा सकता है।

```java
import javax.persistence.EntityManagerFactory;

@SpringBootTest
public class ForwardCursorTest {

    //...

    @Test
    @Transactional
    public void testForwardCursorFetchSize_Transactional() throws SQLException {
        entityManager.createNativeQuery("set application_name to 'Implicit autocommit disable';")
                .executeUpdate();
        Cursor cursor = getInternalPgResultSet();
        assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
    }

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;
    
    @Test
    public void testForwardCursorFetchSize_Transactional_NonManaged() throws SQLException {
        entityManager = entityManagerFactory.createEntityManager();
        entityManager.getTransaction().begin();
        entityManager.unwrap(UnitOfWork.class).beginEarlyTransaction();
        Cursor cursor = getInternalPgResultSet();
        assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
        entityManager.getTransaction().rollback();
    }
}
```

इसके बाद, JEE लेनदेन के मामले में, JCA स्पेसिफिकेशन (JBoss / WildFly JDBC) यह सुनिश्चित करता है कि ऑटो-कमिट मोड लेनदेन की शुरुआत में ही बंद हो जाए (लेनदेन डेटा स्रोत के लिए)। `TransactionAttributeType.NEVER` एट्रिब्यूट के साथ JEE लेनदेन के संदर्भ में, हम JPA लेनदेन शुरू नहीं करेंगे या `unwrap()` विधि का उपयोग करके कनेक्शन प्राप्त नहीं करेंगे। हम EclipseLink सत्र घटनाओं को सुनकर कनेक्शन को इंटरसेप्ट करने का प्रयास कर सकते हैं, हालांकि एट्रिब्यूट्स को संशोधित करना EJB 3 स्पेसिफिकेशन के अनुरूप नहीं होगा।

## कनेक्शन पैरामीटर का संशोधन

उपरोक्त स्पेसिफिकेशन्स को ध्यान में रखते हुए, मैं परंपरा को तोड़ने के खिलाफ सलाह दूंगा। आइए उपयोग की जाने वाली तकनीकों के अनुसार नियंत्रक की शर्तों को पूरा करने का प्रयास करें। हालांकि, ऐसी प्रतिबंधों की अनुपस्थिति में, क्या हम अपेक्षाकृत कम लागत पर ऐसे उपयोग के मामले के लिए समर्थन जोड़ने में सक्षम होंगे? इस प्रश्न का उत्तर निश्चित रूप से EclipseLink *SessionEventListener* इंटरफ़ेस होगा।

```java
package dev.termian.demo;

import org.eclipse.persistence.config.QueryHints;
import org.eclipse.persistence.config.ResultSetType;
import org.eclipse.persistence.internal.databaseaccess.Accessor;
import org.eclipse.persistence.internal.databaseaccess.DatasourceCall;
import org.eclipse.persistence.internal.jpa.QueryHintsHandler;
import org.eclipse.persistence.internal.sessions.AbstractSession;
import org.eclipse.persistence.queries.DatabaseQuery;
import org.eclipse.persistence.sessions.SessionEvent;
import org.eclipse.persistence.sessions.SessionEventAdapter;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class CursorQueryAutocommitDisabler extends SessionEventAdapter {

    private final Set<Accessor> modifiedAccessors = 
            Collections.newSetFromMap(new ConcurrentHashMap<>());

    @Override
    public void preExecuteCall(SessionEvent event) { // #1
        super.preExecuteCall(event);
        DatabaseQuery query = getForwardCursorQuery(event);
        if (query != null) {
            disableAutocommit(query, query.getSession());
        }
    }

    private void disableAutocommit(DatabaseQuery query, AbstractSession session) {
        for (Accessor accessor : query.getAccessors()) { // #3a
            accessor.incrementCallCount(session); // #5
            Connection connection = accessor.getConnection(); // #3b
            try {
                if (connection.getAutoCommit()) {
                    connection.setAutoCommit(false); // #6
                    modifiedAccessors.add(accessor); // #7
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    @Override
    public void postExecuteCall(SessionEvent event) {
        super.preExecuteCall(event);
        DatabaseQuery query = getForwardCursorQuery(event);
        if (query != null) {
            for (Accessor accessor : query.getAccessors()) {
                accessor.decrementCallCount();
            }
        }
    }

    private DatabaseQuery getForwardCursorQuery(SessionEvent event) { 
        if (!(event.getCall() instanceof DatasourceCall)) {
            return null;
        }
        DatasourceCall call = (DatasourceCall) event.getCall();
        if (call.getQuery() == null) {
            return null;
        }
        DatabaseQuery query = call.getQuery(); // #2

        //noinspection unchecked 
        Map<String, Object> hints = (Map<String, Object>) query
                .getProperty(QueryHintsHandler.QUERY_HINT_PROPERTY);
        if (hints == null || // #4
                !ResultSetType.ForwardOnly.equals(hints.get(QueryHints.RESULT_SET_TYPE))) {
            return null;
        }
        return query;
    }

    @Override
    public void preReleaseConnection(SessionEvent event) {
        super.preReleaseConnection(event);
        Accessor accessor = (Accessor) event.getResult();
        if (modifiedAccessors.remove(accessor)) {
            Connection connection = accessor.getConnection();
            try {
                connection.rollback();
                connection.setAutoCommit(true); // #8
            } catch (SQLException e) {
                accessor.setIsValid(false); // #9
            }
        }
    }
}
```

`preExecuteCall()` (#1) विधि वह क्षण है जब EclipseLink 2.7+ ने पहले ही एक्सेसर्स (#3a) की सूची को इनिशियलाइज़ कर लिया है जिसके माध्यम से डेटाबेस कनेक्शन (#3b) किया जाता है। यहाँ हम जाँच सकते हैं कि एक क्षण में किस प्रकार की क्वेरी (#2) निष्पादित की जाएगी।

एक फॉरवर्ड कर्सर क्वेरी से निपटने के लिए, हम कनेक्शन गणना (#4) को बढ़ाते हैं। एक बाहरी कनेक्शन पूल (जैसे JNDI) के मामले में, यह वह जगह है जहाँ SQL कनेक्शन पुनर्प्राप्त किया जाता है (यदि लागू नहीं किया गया है, तो आमतौर पर शीघ्र ही बाद में)। आंतरिक पूल से कनेक्शन *preExecuteCall* को कॉल करने से पहले इनिशियलाइज़ किए जाते हैं।

फिर हम `autocommit` (#5) को अक्षम करते हैं और एक्सेसर को संशोधित (#6) के रूप में चिह्नित करते हैं ताकि बाद में हम कनेक्शन (#7) की पिछली प्रॉपर्टी को पुनर्स्थापित कर सकें। अंततः, पूल में लौटने से पहले, जैसे कि कर्सर बंद करते समय, [साझा ताले](https://www.cybertec-postgresql.com/en/disabling-autocommit-in-postgresql-can-damage-your-health#:~:text=Problem:%20locks%20in%20the%20database) जारी किए जाते हैं। एक अप्रत्याशित त्रुटि के मामले में, हम एक्सेसर (#9) को अमान्य कर देते हैं, जिससे EclipseLink को कनेक्शन बंद करने की सूचना मिलती है।

अब हम अपनी कॉन्फ़िगरेशन को `persistence.xml` फ़ाइल में लागू कर सकते हैं:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<persistence version="2.1" xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence 
             http://xmlns.jcp.org/xml/ns/persistence/persistence_2_1.xsd">
    <persistence-unit name="my-pu">
        <!--...-->
        <properties>
            <!--...-->
            <property name="eclipselink.session-event-listener"
                      value="dev.termian.demo.CursorQueryAutocommitDisabler"/>
        </properties>
    </persistence-unit>
</persistence>
```

वैकल्पिक रूप से, कॉन्फ़िगरेशन को अस्थायी रूप से एक साझा सर्वर सत्र में जोड़ा जा सकता है:

```java
import org.eclipse.persistence.sessions.SessionEventManager;
import org.eclipse.persistence.sessions.server.ServerSession;

public class ForwardCursorTest {
    //...
    @Test
    public void testForwardCursorFetchSize_NonTransactional_AutocommitDisabled()
            throws SQLException {
        SessionEventManager eventManager = entityManagerFactory.createEntityManager()
                .unwrap(ServerSession.class).getEventManager();
        CursorQueryAutocommitDisabler queryListener = new CursorQueryAutocommitDisabler();
        eventManager.addListener(queryListener);

        try {
            Cursor cursor = getInternalPgResultSet();
            assertEquals(FETCH_SIZE, getConsuming(cursor, PgResultSet::getLastUsedFetchSize));
        } finally { // ServerSession is shared by entity managers of the same factory
            eventManager.removeListener(queryListener);
        }

        Cursor cursorOnReusedConnection = getInternalPgResultSet();
        assertNotEquals(FETCH_SIZE,
                getConsuming(cursorOnReusedConnection, PgResultSet::getLastUsedFetchSize)
        );
    }
}
```

<img src="/img/hq/eclipselink-paged-cursor-postgresql.png" alt="EclipseLink पेजिनेटेड PostgreSQL कर्सर" title="EclipseLink पेजिनेटेड PostgreSQL कर्सर">

