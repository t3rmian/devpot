---
title: SQL प्रेडिकेट्स मूल्यांकन क्रम
url: एसक्यूएल-प्रेडिकेट्स-मूल्यांकन-क्रम
id: 98
category:
- databases: डेटाबेस
tags:
- एसक्यूएल
- ओरेकल
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

एक SQL क्वेरी बनाते समय, विधेय का क्रम आमतौर पर उस क्रम को निर्धारित नहीं करता है जिसमें उनका मूल्यांकन किया जाता है।
यह काफी हद तक भाषा की घोषणात्मक प्रकृति के कारण है। अनिवार्य भाषाओं (PL/SQL, Java, C) के विपरीत,
हम इस पर ध्यान केंद्रित करते हैं कि हम क्या हासिल करना चाहते हैं, न कि कैसे।

क्वेरी निष्पादन योजना का वास्तविक विकल्प विशिष्ट कार्यान्वयन (ऑप्टिमाइज़र एल्गोरिदम) पर निर्भर करता है।
ऐसी प्रक्रिया अक्सर घोषित डेटा संरचनाओं के भीतर डेटा वितरण पर आधारित होती है।
आप अक्सर SQL की घोषणात्मक प्रकृति से अनभिज्ञ या भूल सकते हैं। हालाँकि, इसके बारे में जानना उचित है, खासकर जब अनिवार्य दृष्टिकोण आपकी दूसरी प्रकृति है।

एक सामयिक नुकसान एक फ़ंक्शन के साथ संयोजन में शॉर्ट-सर्किट मूल्यांकन की अपेक्षा से आता है जो एक अमान्य इनपुट (क्रम) के तहत त्रुटि में परिणाम कर सकता है।
आमतौर पर, शॉर्ट-सर्किट मूल्यांकन आपको आगे की प्रक्रिया को छोड़ने की अनुमति देता है यदि यह परिणाम को प्रभावित नहीं करता है।

## शॉर्ट-सर्किट मूल्यांकन

क्या एक टेक्स्ट मान चालू वर्ष से पिछले वर्षों को इंगित करता है, इसके प्रिंटआउट के एक उदाहरण के माध्यम से, हम शॉर्ट-सर्किट मूल्यांकन का प्रदर्शन कर सकते हैं:

```java
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;

class Scratch {
    private static final DateTimeFormatter YEAR_PATTERN = DateTimeFormatter.ofPattern("yyyy");

    public static void main(String[] args) {
        Arrays.asList(null, "invalid", "2050", "1990", "0000")
                .forEach(Scratch::printWhetherPastYear);
    }

    private static void printWhetherPastYear(String text) {
        System.out.printf("'%s' is a past year: %s%n", text, isPastYear(text));
    }

    private static boolean isPastYear(String text) {
        return text != null
                && text.matches("\\d{4}")
                && Year.from(YEAR_PATTERN.parse(text)).isBefore(Year.now());
    }

    /*
     * 'null' is a past year: false // text != null)
     * 'invalid' is a past year: false // text.matches("\\d{4}")
     * '2050' is a past year: false // isBefore
     * '1990' is a past year: true // isBefore
     * Exception in thread "main" java.time.format.DateTimeParseException: Text '0000' could not be parsed:
     *      Invalid value for YearOfEra (valid values 1 - 999999999/1000000000): 0
     *      // isBefore
     */
}
```

उपरोक्त टिप्पणी निष्पादन के परिणाम को दर्शाती है। पहले दो मामलों में, अंतिम विधेय का कोई मूल्यांकन नहीं होता है (अन्यथा एक त्रुटि फेंक दी जाएगी)।

### SQL विधेय क्रम

हम एक Oracle डेटाबेस में समान मानदंड बना सकते हैं, उदाहरण के लिए:
```sql
CREATE TABLE messages
(
    text VARCHAR(255)
);

INSERT ALL
    INTO messages (text) VALUES (null)
    INTO messages (text) VALUES ('invalid')
    INTO messages (text) VALUES ('1990')
    INTO messages (text) VALUES ('2050')
--     INTO messages (text, type) VALUES ('0000', 'year')
SELECT * FROM dual;

EXPLAIN PLAN FOR
SELECT text as "Is a past year", 1
FROM messages
WHERE TO_DATE(text, 'YYYY') < SYSDATE
  AND REGEXP_LIKE(text, '^[[:digit:]]{4}$');

SELECT *
FROM TABLE (DBMS_XPLAN.DISPLAY);
```

ऑप्टिमाइज़र का परिणाम एक योजना है जिसमें विधेय का क्रम बदल दिया गया है। काफी चतुर - अन्यथा, हमें एक त्रुटि मिलती।

```sql
Plan hash value: 2071386872
 
------------------------------------------------------------------------------
| Id  | Operation         | Name     | Rows  | Bytes | Cost (%CPU)| Time     |
------------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |          |     1 |   129 |     3   (0)| 00:00:01 |
|*  1 |  TABLE ACCESS FULL| MESSAGES |     1 |   129 |     3   (0)| 00:00:01 |
------------------------------------------------------------------------------
 
Predicate Information (identified by operation id):
---------------------------------------------------
 
"   1 - filter( REGEXP_LIKE (""TEXT"",'^[[:digit:]]{4}$') AND "
"              TO_DATE(""TEXT"",'YYYY')<SYSDATE@!)"
 
Note
-----
   - dynamic statistics used: dynamic sampling (level=2)
```

<center>
<table>
<tr>
  <th>Is a past year</th>
</tr>
<tr>
  <td>1990</td>
</tr>
</table>
</center>

अब, विधेय को थोड़ा जटिल करके, हम इसे भाषा की अनिवार्यता की (गलत) धारणा के तहत एक रूपांतरण त्रुटि में बदल सकते हैं।

```sql
EXPLAIN PLAN FOR
SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
  AND TO_DATE(text, 'YYYY') < TO_DATE('2022', 'YYYY');

SELECT *
FROM TABLE (DBMS_XPLAN.DISPLAY);

-- Predicate Information (identified by operation id):
-- ---------------------------------------------------
--  
-- "   1 - filter(TO_DATE(""TEXT"",'YYYY')<TO_DATE('2022','YYYY') AND "
-- "              SUBSTR(""TEXT"",1,4)=TO_CHAR(TO_DATE('2022','YYYY'),'YYYY'))"

SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
-- 0 rows retrieved in 101 ms (execution: 8 ms, fetching: 93 ms)
SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
  AND TO_DATE(text, 'YYYY') < TO_DATE('2022', 'YYYY')
-- ORA-01841
```

एक जटिल क्वेरी में ऐसी त्रुटि का सामना करते समय, यह सत्यापित करना उचित है कि क्या आपने क्रम के बारे में गलत धारणाएं नहीं बनाई हैं।
Oracle DB में, सामान्य रूपांतरण त्रुटियों में निम्नलिखित कोड शामिल हैं:
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

ये त्रुटियां विशेष रूप से आश्चर्यजनक हो सकती हैं यदि वे केवल एप्लिकेशन से क्वेरी लागू करते समय होती हैं।
अक्सर, यह क्वेरी योजनाओं में अंतर के कारण होता है (बाइंड चर की एक अलग संख्या या उनकी कमी)।

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: (पूर्ण) वर्ष -4713 और +9999 के बीच होना चाहिए, और 0 नहीं होना चाहिए" title="ORA-01841: (पूर्ण) वर्ष -4713 और +9999 के बीच होना चाहिए, और 0 नहीं होना चाहिए">

त्रुटि द्वारा इंगित स्थिति के माध्यम से, आप जल्दी से पा सकते हैं कि यह क्वेरी योजना निष्पादन के दौरान किस चरण में हुआ।
योजना को देखने के लिए, `V$SQL` (SQL_TEXT) और `V$SQL_PLAN` (SQL_ID) सिस्टम दृश्यों की जाँच करें।
आप SQL ID प्रदान करके और योजना को एक तालिका के रूप में पुनर्प्राप्त करके `DBMS_XPLAN.DISPLAY_CURSOR` प्रक्रिया को भी लागू कर सकते हैं (जैसा कि उदाहरण में है)।

## मूल्यांकन के क्रम को लागू करना

`CASE` अभिव्यक्ति या `DECODE` फ़ंक्शन (लेकिन Oracle DB में `NVL` नहीं) आमतौर पर उपरोक्त समस्या को हल करने में मदद करता है।
हालांकि, दस्तावेज़ीकरण के साथ दोबारा जांच लें कि क्या शॉर्ट-सर्किट मूल्यांकन आपके डेटाबेस में भी उसी तरह काम करता है।

```sql
SELECT text as "Is a past year"
FROM messages
WHERE DECODE(SUBSTR(text, 1, 4), to_char(TO_DATE('1990', 'YYYY'), 'YYYY'), TO_DATE(text, 'YYYY'), null)
          < TO_DATE('2022', 'YYYY');

SELECT text as "Is a past year"
FROM messages
WHERE CASE
          WHEN SUBSTR(text, 1, 4) = to_char(TO_DATE('1990', 'YYYY'), 'YYYY') THEN TO_DATE(text, 'YYYY')
          END
          < TO_DATE('2022', 'YYYY');
```

फिर भी एक और - प्रक्रियात्मक - विकल्प एक कस्टम फ़ंक्शन का उपयोग करना है:
```sql

CREATE OR REPLACE FUNCTION to_date_nullable(p_text IN VARCHAR2,
                                            p_format IN VARCHAR2)
    RETURN DATE
    IS
BEGIN
RETURN TO_DATE(p_text, p_format);
EXCEPTION
    WHEN OTHERS
        THEN
            RETURN NULL;
END;

SELECT text as "Is a past year"
FROM messages
WHERE to_date_nullable(text, 'YYYY') < TO_DATE('2022', 'YYYY');
```

हालाँकि, यदि आप प्रदर्शन के हर बिट की परवाह करते हैं, तो आप इन वर्कअराउंड के बिना बेहतर होंगे।
इसके बजाय, अपनी क्वेरी के लिए उपयुक्त संरचनाओं और डेटा प्रकारों का उपयोग करने पर विचार करें।
मूल्यांकन क्रम का विकल्प ऑप्टिमाइज़र पर छोड़ दें।
