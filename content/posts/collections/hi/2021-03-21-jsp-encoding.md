---
title: JSP एन्कोडिंग
url: jsp-एन्कोडिंग
id: 62
category:
- jee: जेईई
tags:
- वेबलॉजिक
- टॉमकैट
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

JSP तकनीक में बने एप्लिकेशन के साथ, आमतौर पर हमारा लक्ष्य सर्वर एक साधारण सर्वर होगा जो एक सर्वलेट कंटेनर को लागू करता है, जैसे टॉमकैट। यदि हम अपने एप्लिकेशन में गैर-मानक डायक्रिटिक्स, उमलॉट्स आदि प्रदर्शित करते हैं, तो उनके सही प्रदर्शन को सत्यापित करना उचित है। सर्वर हमारे JSP टेम्प्लेट में हमारे निर्देशों को अलग-अलग तरीके से मान सकते हैं यदि हम एन्कोडिंग को ठीक से निर्दिष्ट नहीं करते हैं।

<img src="/img/hq/jsp-encoding.png" alt="JSP में वर्ण एन्कोडिंग समस्याओं को दर्शाने वाला चित्र" title="JSP एन्कोडिंग समस्याएं">

## एन्कोडिंग

JSP के मामले में, एन्कोडिंग को `page` डायरेक्टिव विशेषताओं के माध्यम से नियंत्रित किया जाता है:
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – अनुवाद के समय पृष्ठ एन्कोडिंग सेट करता है और यदि `contentType` गायब है, तो सर्वर प्रतिक्रिया के समय भी;
- `contentType` – सर्वर प्रतिक्रिया के दौरान एन्कोडिंग सेट करता है।

एक्सटेंशन के आधार पर, इन पैरामीटर के अलग-अलग डिफ़ॉल्ट मान हो सकते हैं:
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`;
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` या `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`।

इसके अलावा, पृष्ठों को आयात करने के 3 तरीके हैं:
- अनुवाद के दौरान ध्यान में रखे गए **include** डायरेक्टिव के माध्यम से: `<%@ include file="page.jsp" %>`;
- प्रतिक्रिया उत्पन्न करते समय **include** एक्शन एलिमेंट के माध्यम से: `<jsp:include page="page.jsp" />`;
- या प्रतिक्रिया उत्पन्न करते समय JSTL टैग के साथ पृष्ठ आयात करके:
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

क्षण (अनुवाद/प्रतिक्रिया) और चयनित (या नहीं) वर्ण एन्कोडिंग के आधार पर, विभिन्न स्थितियों में विभिन्न समस्याएं दिखाई दे सकती हैं। मैं प्रत्येक पृष्ठ पर (शामिल पृष्ठों पर भी) `pageEncoding` और `contentType` पैरामीटर जोड़ने की सलाह देता हूं, साथ ही आयात के दौरान `charEncoding` को भी याद रखें।

## परीक्षण
मैं एक परीक्षण खेल का मैदान बनाने के लिए [spring JSP डेमो](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp) की सिफारिश करता हूं। आप एन्कोडिंग पैरामीटर के साथ खेलने के लिए *hello.jsp* को बदलने के लिए एक नमूना JSP टेम्पलेट का उपयोग कर सकते हैं:
```xml
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>UTF-8 Test</title>
</head>
<body>
    <h1>Main page:</h1>
    <h3>dynamic: ${name}</h3>
    <h3>static: Heizölrückstoßabdämpfung</h3>
    
    <h1>Directive include:</h1>
    <%@ include file="page.jsp" %>
    
    <h1>JSP include:</h1>
    <jsp:include page="page.jsp"/>
    
    <h1>Import:</h1>
    <c:import url="page.jsp" charEncoding="UTF-8"/>
</body>
</html>
```
*page.jsp*:
```html
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<h3>dynamic: ${name}</h3>
<h3>static: Heizölrückstoßabdämpfung</h3>
```

JSTL निर्भरता जोड़ें और गैर-एम्बेडेड सर्वर पर परिनियोजन के मामले में पैकेजिंग को WAR में बदलें:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <packaging>war</packaging>
    <!--...-->

    <dependencies>
        <!--...-->
		<dependency>
			<groupId>javax.servlet</groupId>
			<artifactId>jstl</artifactId>
			<version>1.2</version>
		</dependency>
    </dependencies>
</project>
```

इसके बाद, हम इसे सर्वर पर तैनात करते हैं या इसे मेवेन रैपर के साथ चलाते हैं: `./mvnw clean spring-boot: run` खोलकर [http://localhost:8080/?name=Heizölrückstoßabdämpfung](http://localhost:8080/?name=Heiz%C3%B6lr%C3%BCcksto%C3%9Fabd%C3%A4mpfung)।

एक दिलचस्प बात यह है कि टॉमकैट (9) और वेबलॉजिक (12/14) विशिष्ट एन्कोडिंग की अनुपस्थिति में थोड़ा अलग व्यवहार करते हैं। EL सिंटैक्स का उपयोग करके बीन विशेषताओं को संदर्भित करते समय, जैसे `${utf8Variable}`, टॉमकैट को URL आयात के दौरान चर मान को ठीक से एन्कोड करने में कोई समस्या नहीं लगती है - वेबलॉजिक के विपरीत।
