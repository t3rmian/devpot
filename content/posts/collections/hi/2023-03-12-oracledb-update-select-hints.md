---
title: OracleDB सबक्वेरी पर हिंट्स लागू करना
url: ओरेकलडीबी-हिंट्स-अपडेट-सबक्वेरीज़
id: 106
category:
- databases: डेटाबेस
tags:
- एसक्यूएल
- ओरेकल
- प्रदर्शन
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

विभिन्न एल्गोरिदम का उपयोग करके तालिकाओं को जोड़ने की लागत का सत्यापन आपको अपनी क्वेरी प्रदर्शन में बेहतर अंतर्दृष्टि दे सकता है।
आप OracleDB ऑप्टिमाइज़र को क्वेरी हिंट्स `/*+ ... */` का उपयोग करके नेस्टेड लूप्स या हैश जॉइन जैसे एक विशिष्ट एल्गोरिदम चुनने के लिए मजबूर कर सकते हैं।
Google खोज से कुछ [शीर्ष परिणाम](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm)
केवल ऐसे हिंट्स के बुनियादी उपयोग की व्याख्या करते हैं बिना सबक्वेरी पर विचार किए।

<img src="/img/hq/explain-sql-plan-intellij.png" alt='एक SQL क्वेरी के लिए IntelliJ के "Explain Plan" त्वरित कार्रवाई का स्क्रीनशॉट' title='एक SQL क्वेरी के लिए IntelliJ की अंतर्निहित "Explain Plan" कार्रवाई'>

## सबक्वेरी के साथ एक वांछित तालिका जुड़ाव को मजबूर करना

`UPDATE` ऑपरेशन के एक उदाहरण पर, आइए देखें कि सबक्वेरी के साथ हिंट्स का उपयोग बहुत स्पष्ट नहीं हो सकता है।
प्रदर्शन के लिए, मैं `ALL_OBJECTS` सिस्टम व्यू से बनाई गई एक तालिका का उपयोग करूंगा।

आप क्वेरी से पहले `EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...` क्लॉज लगाकर एक क्वेरी प्लान स्पष्टीकरण उत्पन्न कर सकते हैं।
इसे निष्पादित करने के बाद, योजना `DBMS_XPLAN.DISPLAY` प्रक्रिया का उपयोग करके पढ़ने के लिए उपलब्ध है।
बस अपनी योजना आईडी और एक वैकल्पिक प्रारूप प्रदान करें।

```sql
CREATE TABLE BIG_TABLE AS
SELECT ROWNUM AS ID, OBJECT_ID, OWNER, OBJECT_NAME,
       SUBOBJECT_NAME, OBJECT_TYPE, STATUS
FROM ALL_OBJECTS;
CREATE TABLE BIG_TABLE_2 AS SELECT * FROM BIG_TABLE;

EXPLAIN PLAN SET STATEMENT_ID = 'MY_UNRESOLVABLE_UPDATE' FOR
UPDATE /*+ LEADING(BT, BT2) USE_NL(BT2) */ BIG_TABLE BT
SET STATUS = 'INVALID'
WHERE OWNER = 'SYSTEM'
  AND EXISTS(SELECT 1
             FROM BIG_TABLE_2 BT2
             WHERE BT.OBJECT_ID = BT2.OBJECT_ID
               AND BT2.OWNER = 'SYSTEM');

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_UNRESOLVABLE_UPDATE',
    FORMAT=>'ALL +HINT_REPORT'));
```
उपरोक्त क्वेरी से, आपको (आपके DB इंस्टेंस के आधार पर) एक *हैश जॉइन* के साथ एक उदाहरण योजना मिलनी चाहिए
*नेस्टेड लूप्स* के बजाय जिसे हम हिंट्स `LEADING` और `USE_NL` के साथ लागू करने का प्रयास कर रहे हैं।

```sql
-------------------------------------------------------------------------------------------
| Id  | Operation                   | Name        | Rows  | Bytes | Cost (%CPU)| Time     |
-------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |             |     3 |   111 |   235   (1)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE   |       |       |            |          |
|*  2 |   HASH JOIN SEMI            |             |     3 |   111 |   235   (1)| 00:00:01 |
|*  3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE   |     3 |    66 |   117   (0)| 00:00:01 |
|*  4 |    TABLE ACCESS STORAGE FULL| BIG_TABLE_2 |     3 |    45 |   117   (0)| 00:00:01 |
-------------------------------------------------------------------------------------------

```
आगे पढ़ने से हमें और जानकारी मिलती है।
संकेत से उपनाम जो उपश्रेणी से तालिका को संदर्भित करता है उसे **अनसुलझा** के रूप में चिह्नित किया गया है:
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

संकेतों को उपश्रेणी में ले जाने से समस्या केवल बदतर हो जाती है। इस बार दोनों को **अनुपयोगी** के रूप में चिह्नित किया गया है।
इस चरण में, ऑप्टिमाइज़र प्रदान किए गए संकेतों का उपयोग करने में असमर्थ है।
आश्चर्यजनक रूप से या नहीं, यहाँ सही समाधान `USE_NL` संकेत को उपश्रेणी में ले जाना है:

```sql
EXPLAIN PLAN SET STATEMENT_ID = 'MY_RESOLVABLE_UPDATE' FOR
UPDATE /*+ LEADING(BT, BT2) */ BIG_TABLE BT
SET STATUS = 'INVALID'
WHERE OWNER = 'SYSTEM'
  AND EXISTS(SELECT /*+ USE_NL(BT2) */ 1
             FROM BIG_TABLE_2 BT2
             WHERE BT.OBJECT_ID = BT2.OBJECT_ID AND BT2.OWNER = 'SYSTEM');

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_RESOLVABLE_UPDATE',
    FORMAT=>'ALL +HINT_REPORT'));

    
-------------------------------------------------------------------------------------------
| Id  | Operation                   | Name        | Rows  | Bytes | Cost (%CPU)| Time     |
-------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |             |     3 |   111 |   467   (1)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE   |       |       |            |          |
|   2 |   NESTED LOOPS SEMI         |             |     3 |   111 |   467   (1)| 00:00:01 |
|*  3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE   |     3 |    66 |   117   (0)| 00:00:01 |
|*  4 |    TABLE ACCESS STORAGE FULL| BIG_TABLE_2 |     3 |    45 |   117   (1)| 00:00:01 |
-------------------------------------------------------------------------------------------

Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2
---------------------------------------------------------------------------

   1 -  SEL$3FF8579E
           -  LEADING(BT, BT2)

   4 -  SEL$3FF8579E / BT2@SEL$1
           -  USE_NL(BT2)
```

## एक सबक्वेरी पर अद्यतन करें

आप किसी क्वेरी के सीधे परिणाम को भी अपडेट कर सकते हैं और गहराई से नेस्टेड सबक्वेरी से छुटकारा पा सकते हैं।
हालांकि, शर्त यह है कि क्वेरी प्रत्येक अपडेट किए गए रिकॉर्ड के लिए ठीक एक पंक्ति लौटाती है।
अन्यथा, आपको अनिवार्य रूप से `ORA-01779` त्रुटि मिलेगी:
> ORA-01779: cannot modify a column which maps to a non key-preserved table
```sql
CREATE UNIQUE INDEX U_BT2_OBJECT_ID ON BIG_TABLE_2 (OBJECT_ID);

EXPLAIN PLAN SET STATEMENT_ID = 'MY_UPDATE_ON_SUB_QUERY' FOR
UPDATE (SELECT /*+ LEADING(BT, BT2) USE_NL(BT2) */ BT.*
        FROM BIG_TABLE BT
        JOIN BIG_TABLE_2 BT2 ON BT.OBJECT_ID = BT2.OBJECT_ID)
SET STATUS = 'INVALID';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_UPDATE_ON_SUB_QUERY',
    FORMAT=>'ALL +HINT_REPORT'));

---------------------------------------------------------------------------------------------
| Id  | Operation                   | Name            | Rows | Bytes | Cost (%CPU)| Time    |
---------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |                 | 3529 |   58K|   119   (2)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE       |      |      |            |          |
|   2 |   NESTED LOOPS              |                 | 3529 |   58K|   119   (2)| 00:00:01 |
|   3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE       | 3529 |   41K|   117   (0)| 00:00:01 |
|*  4 |    INDEX UNIQUE SCAN        | U_BT2_OBJECT_ID |    1 |     5|     0   (0)| 00:00:01 |
---------------------------------------------------------------------------------------------

Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2
---------------------------------------------------------------------------
 
   1 -  SEL$D4938F8A
           -  LEADING(BT, BT2)
 
   4 -  SEL$D4938F8A / BT2@SEL$1
           -  USE_NL(BT2)
```

जॉइन पर एक अद्वितीय सूचकांक जोड़ने से आवश्यकता पूरी होती है।
इसके अलावा, हम ऑप्टिमाइज़र के लिए काफी [इष्टतम](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
स्थितियाँ प्राप्त करते हैं ताकि वह स्वयं **नेस्टेड लूप्स** का चयन कर सके।

## सारांश

ऑप्टिमाइज़र को प्रभावित करने के बारे में अधिक जानकारी के लिए, [OracleDB 21 दस्तावेज़ीकरण](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA) का नवीनतम संस्करण देखें।
दुर्भाग्य से, किसी कारण से, नवीनतम दस्तावेज़ीकरण Google द्वारा खराब तरीके से अनुक्रमित किया गया है। कुछ छोटे लेकिन फिर भी जानकारीपूर्ण लेखों के लिए, इन्हें देखें:
- [Oracle 10g फुल हिंटिंग](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/);
- [Oracle 19c हिंट उपयोग रिपोर्टिंग](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0)।
