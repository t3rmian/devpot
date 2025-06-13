---
title: dblink कनेक्शन संसाधनों को मुक्त करना
url: डीबीलिंक-ओआरए-01453-ऑटोकम्मिट
id: 96
category:
- databases: डेटाबेस
tags:
- oracle
- jdbc
- dblink
author: Damian Terlecki
date: 2022-10-02T20:00:00
---

OracleDB DBlink एक ऐसी सुविधा है जो आपको दूसरे डेटाबेस इंस्टेंस से कनेक्शन स्थापित करने की अनुमति देती है।

```sql
create public database link remote
    connect to MY_USER identified by MY_PASSWORD
    using '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(service_name=ORCLPDB1)))';

select * from dual@remote;
```

ऐसे कनेक्शन की एक दिलचस्प विशेषता यह है कि dblink टेबल पर एक साधारण SELECT क्वेरी के साथ ही undo सेगमेंट पर एक अंतर्निहित (implicit) ट्रांज़ैक्शन लॉक लग जाता है।
यह सुविधा संस्करण 11.2 के लिए [एडमिनिस्ट्रेटर गाइड](https://docs.oracle.com/cd/E18283_01/server.112/e17120/ds_appdev002.htm) में वर्णित है।
एप्लिकेशन के दृष्टिकोण से, यह संसाधन रिलीज के मामले में विशेष रूप से दिलचस्प है। और भी ज्यादा, जब dblink एक्सेस को व्यू या प्रोसीजर के अंदर छिपाया जा सकता है।

<img src="/img/hq/ora-01453-dblink-autocommit.png" alt="डीबीलिंक व्यू" title="डीबीलिंक व्यू">

## कनेक्शन पूल

एक सामान्य एप्लिकेशन अक्सर किसी न किसी तरह का कनेक्शन पूल इस्तेमाल करती है।
तकनीक और एब्स्ट्रैक्शन के स्तर के आधार पर, पूल का उपयोग हो सकता है:
- उपयोगकर्ता से छिपा हुआ हो और पूरी तरह से सर्वर/कंटेनर (JPA/JTA) द्वारा संभाला जाए;
- उपयोगकर्ता के अनुरोध पर हो (DataSource तक सीधी पहुंच), जिसकी ज़िम्मेदारी सत्र में आवंटित संसाधनों को जारी करना है।

जब एप्लिकेशन को ऐसे कनेक्शन की आवश्यकता नहीं रह जाती (लेन-देन का घोषणात्मक अंत/कनेक्शन बंद करने का आदेश), तो यह पूल में वापस आ जाता है।
बाद में, इसे भौतिक रूप से बंद किए बिना फिर से इस्तेमाल किया जा सकता है।

## JDBC और dblink

dblink की ट्रांजैक्श्नल प्रकृति आपको सतर्क कर देनी चाहिए। ट्रांज़ैक्शन लॉक को हटाने के लिए आपको कमिट या
रोलबैक की आवश्यकता होगी। यह निम्नलिखित स्थितियों में विशेष रूप से अजीब लग सकता है:
- ऑटो-कमिट मोड में कनेक्शन पर dblink का उपयोग करने से आप मोड बदले बिना कमिट/रोलबैक को कॉल नहीं कर सकते (विशेष रूप से गैर-ट्रांजैक्श्नल JTA के साथ समस्याग्रस्त);
> java.sql.SQLException: Could not rollback with auto-commit set on
> at oracle.jdbc.driver.PhysicalConnection.rollback(PhysicalConnection.java:2427)
- केवल-पढ़ने के लिए (read-only) मोड में कनेक्शन पर dblink का उपयोग करना, यानी `SET TRANSACTION READ ONLY;` - ट्रांज़ैक्शन लॉक फिर भी लगेगा।

उदाहरण के लिए, जब *dblink* द्वारा आवंटित संसाधनों को जारी किए बिना कनेक्शन जारी किया जाता है, तो "नए" कनेक्शन पर ट्रांज़ैक्शन स्तर बदलना विफल हो सकता है:
> java.sql.SQLException: ORA-01453: SET TRANSACTION must be first statement of transaction  
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:450)  
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:399)  
at oracle.jdbc.driver.T4C8Oall.processError(T4C8Oall.java:1059)  
at oracle.jdbc.driver.T4CTTIfun.receive(T4CTTIfun.java:522)  
at oracle.jdbc.driver.T4CTTIfun.doRPC(T4CTTIfun.java:257)  
at oracle.jdbc.driver.T4C8Oall.doOALL(T4C8Oall.java:587)  
at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:225)  
at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:53)  
at oracle.jdbc.driver.T4CPreparedStatement.executeForRows(T4CPreparedStatement.java:943)  
at oracle.jdbc.driver.OracleStatement.doExecuteWithTimeout(OracleStatement.java:1150)  
at oracle.jdbc.driver.OraclePreparedStatement.executeInternal(OraclePreparedStatement.java:4798)  
at oracle.jdbc.driver.OraclePreparedStatement.execute(OraclePreparedStatement.java:4901)  
at oracle.jdbc.driver.OraclePreparedStatementWrapper.execute(OraclePreparedStatementWrapper.java:1385)

वास्तव में, यह इस तरह दिखेगा:
```sql
-- app conn 1 (physical conn 1)
SET TRANSACTION READ ONLY;
select * from dual@remote;
-- app conn 1 closed (physical conn 1)
-- app conn 2 (physical conn 1)
SET TRANSACTION READ ONLY; -- error
```

## सत्यापन/डीबगिंग

यह जांचने के लिए कि क्या यह समस्या आपके एप्लिकेशन से संबंधित है, आप डेटाबेस पर खुली ट्रांज़ैक्शन्स को सत्यापित करें।
आपको निम्नलिखित सिस्टम व्यू पर SELECT अनुमतियों की आवश्यकता होगी:
```sql
GRANT SELECT ON V_$TRANSACTION to MY_USER; -- सक्रिय ट्रांज़ैक्शन्स
GRANT SELECT ON V_$SESSION to MY_USER; -- सत्र
GRANT SELECT ON V_$SQL to MY_USER; -- सत्रों में हाल की क्वेरीज़
GRANT SELECT ON V_$PROCESS to MY_USER; -- सत्र-प्रोसेस एसोसिएशन
GRANT SELECT ON V_$DBLINK to MY_USER; -- dblink कनेक्शन और ट्रांज़ैक्शन स्थितियाँ, लेकिन केवल वर्तमान सत्र के लिए
```

एक बार जब आपको अनुमतियाँ मिल जाएं, तो क्वेरी का समय आ गया है:

```sql
SELECT session_.SID
     , session_.SERIAL#
     , session_.USERNAME
     , session_.OSUSER
     , session_.PROGRAM
     , session_.EVENT
     , TO_CHAR(session_.LOGON_TIME,
               'YYYY-MM-DD HH24:MI:SS') as LOGON_TIME
     , TO_CHAR(transaction_.START_DATE,
               'YYYY-MM-DD HH24:MI:SS') as START_DATE
     , session_.LAST_CALL_ET
     , session_.BLOCKING_SESSION
     , session_.STATUS
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.PREV_SQL_ID
          AND ROWNUM <= 1)              AS PREV_SQL
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.SQL_ID
          AND ROWNUM <= 1)              AS CURRENT_SQL
FROM V$SESSION session_,
     V$TRANSACTION transaction_
WHERE session_.SADDR = transaction_.SES_ADDR;
```

उपरोक्त क्वेरी में, निम्नलिखित कॉलमों पर एक नज़र डालें:
- `LAST_CALL_ET` सत्र में अंतिम गतिविधि के बाद से सेकंड की संख्या दिखा रहा है;
- `START_DATE` एप्लिकेशन में किसी घटना के अनुरूप ट्रांज़ैक्शन का;
- सत्र में पिछली `PREV_SQL` या वर्तमान `CURRENT_SQL` क्वेरी;

आमतौर पर, यह जानकारी समस्या के स्रोत की पहचान करने के लिए पर्याप्त होती है।

## लॉग्स

JDBC स्तर पर कॉल्स को ट्रेस करने से आपको किसी खुले ट्रांज़ैक्शन को एक विशिष्ट प्रक्रिया के साथ सटीक रूप से जोड़ने में मदद मिल सकती है।
[OJDBC लॉगिंग कॉन्फ़िगरेशन](https://docs.oracle.com/database/121/JJDBC/diagnose.htm#JJDBC28885) पर एक नज़र डालें।
संक्षेप में, आपको लॉगिंग के लिए बनाए गए एक ड्राइवर की आवश्यकता होगी, यानी `_g` प्रत्यय के साथ, उदाहरण के लिए मेवेन रिपॉजिटरी से:

```xml
<dependency>
    <groupId>com.oracle.database.jdbc.debug</groupId>
    <artifactId>ojdbc8_g</artifactId>
    <version>21.7.0.0</version>
</dependency>
```

बुनियादी कॉन्फ़िगरेशन के बाद, आप कनेक्शन स्थापना (लॉगऑन ईवेंट) और आमंत्रित क्वेरी से मेल खाने वाले लॉग देखेंगे:
```plaintext
2022-10-02 10:59:12.150  INFO 524 --- [main] oracle.jdbc: setCollectionUsageThreshold<PS Old Gen>(5136659251)
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Connection.logon: oracle.jdbc.driver.T4CConnection@66f659e6
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Operating System Process Identifier (SPID): 2411
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: DRCP Enabled: false
2022-10-02 10:59:13.029  INFO 524 --- [main] com.zaxxer.hikari.HikariDataSource: HikariPool-1 - Start completed.
2022-10-02 10:59:13.795  INFO 524 --- [main] oracle.jdbc: 30839E44 SQL: SET TRANSACTION READ ONLY
2022-10-02 10:59:13.900  INFO 524 --- [main] oracle.jdbc: 47E51549 SQL: SELECT * FROM orders@remote
```

इसके अलावा, सबसे बेहतरीन लॉगिंग के साथ, आपको क्वेरीज़ से जुड़े SID/SERIAL#/TRACEFILE भी मिलेंगे:

```plaintext
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSerialNumber
FINEST: 191A709B Return: 42858
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSessionId
FINEST: 191A709B Return: 285
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.OracleSql getOriginalSql
FINEST: 360E9C06 Return: SELECT * FROM orders@remote
```

आपको बेस पर क्वेरी करके सत्र-प्रोसेस एसोसिएशन मिलेगा:
```sql
SELECT *
FROM V$SESSION s
         JOIN V$PROCESS p on s.PADDR = p.ADDR
WHERE p.SPID = 2411;
```

दुर्भाग्य से, इस तरह की निम्न-स्तरीय लॉगिंग प्रति सेकंड दसियों MB लॉग उत्पन्न कर सकती है, इसलिए इसे केवल प्रासंगिक पैकेजों के लिए कॉन्फ़िगर करना सबसे अच्छा है।
फिर आप साझा थ्रेड लॉग या किसी सहसंबंध आईडी (correlation ID) द्वारा एक विशिष्ट फ़ंक्शन की पहचान कर सकते हैं।
वैकल्पिक रूप से, आप `DBMS_APPLICATION_INFO` पैकेज के माध्यम से डेटाबेस सत्र में ट्रैकिंग जानकारी जोड़ सकते हैं।

> `connection.setClientInfo("OCSID.MODULE", "My application");`  
> `connection.setClientInfo("OCSID.ACTION", "Generate a report");`
