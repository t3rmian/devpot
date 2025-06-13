---
title: EclipseLink में आउटपुट क्वेरीज़ को डीबग करने का एक एड-हॉक तरीका
url: एक्लिप्सलिंक-में-एसक्यूएल-एग्जीक्यूशन-का-डीबग-आउटपुट
id: 124
category:
- jpa: जेपीए
tags:
- एक्लिप्सलिंक
- लॉगिंग
- प्रदर्शन
- डीबगिंग
author: Damian Terlecki
date: 2024-02-04T20:00:00
---

यदि आप उचित लॉगिंग कॉन्फ़िगरेशन के बिना EclipseLink चलाने वाले किसी ऐप को डीबग करते हैं, तो आपको
EL द्वारा उत्पन्न अंतिम SQL क्वेरी प्राप्त करना चुनौतीपूर्ण लग सकता है। आमतौर पर,
EL दृढ़ता कॉन्फ़िगरेशन में `eclipselink.logging.level` और `eclipselink.logging.logger` गुण होते हैं।
ये लॉगिंग व्यवहार को नियंत्रित करते हैं। `FINE` स्तर के साथ, आप जटिल प्रक्रियाओं के लिए SQL क्वेरी लॉग कर सकते हैं और जांच सकते हैं कि क्या वे उप-इष्टतम हैं।

जब लॉगिंग अक्षम या पहुंच योग्य नहीं है, लेकिन JVM डीबग पोर्ट उपलब्ध है, तो आप उन स्थानों की तलाश कर सकते हैं
जहां लॉग आउटपुट स्ट्रीम में लिखे जाते हैं। EclipseLink के मामले में, अधिकांश लॉगिंग
`org.eclipse.persistence.logging.SessionLog` इंटरफ़ेस के माध्यम से कार्यान्वित की जाती है:

```java
public interface SessionLog extends Cloneable {
    //... log-related methods
    public boolean shouldLog(int level);
    public boolean shouldLog(int level, String category);
    public void log(int level, String message);
    //12 overloads...
    public void throwing(Throwable throwable);
    public void severe(String message);
    public void warning(String message);
    //5 more JDK-related log-level methods...
    public void logThrowable(int level, Throwable throwable);
    public void logThrowable(int level, String category, Throwable throwable);
    //...
}
```
आप उनमें ब्रेकपॉइंट डाल सकते हैं, लेकिन सभी लॉग-आउटपुटिंग विधियाँ अनावश्यक ऑब्जेक्ट बनाने से `shouldLog` विधियों (संदेश-रहित) द्वारा संरक्षित हैं। लॉगिंग के अलावा एक और सामान्य स्थान जिसमें डेटाबेस क्वेरी अपने संदर्भ में होती है, प्रोफाइलिंग है।

EclipseLink में अधिकांश प्रोफाइलिंग `org.eclipse.persistence.internal.sessions.AbstractSession` में `startOperationProfile` ऑपरेशन से शुरू होती है। यद्यपि यह एक आंतरिक विधि है जो परिवर्तन (संस्करण 2.7) के अधीन है,
आप इसे अपनी आवश्यकताओं के अनुसार डीबग करने के लिए स्वतंत्र हैं।

<img src="/img/hq/debug-profiling-eclipselink.png" title="EclipseLink AbstractSession प्रोफाइलर" alt="EclipseLink AbstractSession प्रोफाइलर">

एक IDE की मदद से, आप क्वेरी विवरण को स्थानीय कंसोल में आउटपुट कर सकते हैं।
ब्रेकपॉइंट शर्त के लिए, जांचें कि क्या यह एक स्टेटमेंट निष्पादन क्वेरी है `SessionProfiler.StatementExecute.equals(operationName) && query != null`।
आउटपुट के लिए, SQL स्ट्रिंग को एक वैकल्पिक अनुवाद पंक्ति के साथ संयोजित करें जो बाइंड पैरामीटर का प्रतिनिधित्व करता है `return String.format("%s%nBind parameters: %s%n%s",query.getSQLString(), java.util.Objects.toString(query.getQueryMechanism().getModifyRow(), ""), java.util.Objects.toString(query.getQueryMechanism().getTranslationRow(), ""));`:

<img src="/img/hq/debug-output-sql-executions-eclipselink.png" title="EclipseLink AbstractSession प्रोफाइलर डीबग" alt="EclipseLink AbstractSession प्रोफाइलर डीबग">

निष्पादन को निलंबित किए बिना, नमूना आउटपुट उत्पन्न होता है:

```sql
CREATE TABLE EMPLOYEE (ID BIGINT NOT NULL, DEPARTMENT VARCHAR, NAME VARCHAR, ADDRESS_ID BIGINT, PRIMARY KEY (ID))
Bind parameters: EmptyRecord()
SELECT * FROM SEQUENCE WHERE SEQ_NAME = 'SEQ_GEN'
Bind parameters: EmptyRecord()
INSERT INTO SEQUENCE(SEQ_NAME, SEQ_COUNT) values ('SEQ_GEN', 0)
Bind parameters: EmptyRecord()
UPDATE SEQUENCE SET SEQ_COUNT = SEQ_COUNT + ? WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN
	PREALLOC_SIZE => 50)
SELECT SEQ_COUNT FROM SEQUENCE WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN)
INSERT INTO EMPLOYEE (ID, DEPARTMENT, NAME, ADDRESS_ID) VALUES (?, ?, ?, ?)
Bind parameters: DatabaseRecord(
	EMPLOYEE.ID => 1
	EMPLOYEE.DEPARTMENT => Marketing
	EMPLOYEE.NAME => Jane Smith
	EMPLOYEE.ADDRESS_ID => null)
	SALARY.employee_id => null)
```

<img src="/img/hq/debug-profiling-console-eclipselink.png" title="EclipseLink AbstractSession प्रोफाइलर IDE कंसोल डीबग आउटपुट" alt="EclipseLink AbstractSession प्रोफाइलर IDE कंसोल डीबग आउटपुट">

आप अपनी एप्लिकेशन प्रक्रियाओं के साथ क्वेरी को सहसंबंधित करने के लिए हमेशा अधिक प्रासंगिक जानकारी आउटपुट कर सकते हैं।
समय, थ्रेड आईडी, क्वेरी एक्सेसर का कनेक्शन, या कस्टम संदर्भ जानकारी जोड़ने के बारे में सोचें।
