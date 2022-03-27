---
title: JSP Encoding
url: jsp-encoding
id: 62
category:
  - jee: JEE
tags:
  - weblogic
  - tomcat
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

Having an application built in JSP technology, usually our target server will be a simple server implementing a servlet container,
e.g. Tomcat. If we display non-standard diacritics, umlauts, etc. in our application, it is worth verifying their
correct display. Servers can treat our directives differently in JSP templates if we don't precisely specify the encoding.

<img src="/img/hq/jsp-encoding.png" alt="Obrazek przedstawiający problemy z enkodowaniem znaków w JSP" title="JSP problemy z enkodowaniem">

## Encoding

In the case of JSP, the encoding is controlled through the `page` directive attributes: 
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – sets the page encoding during translation time and if `contentType` is missing, also during the server response time;
- `contentType` – sets the encoding when during server response.

Depending on the extension, these parameters may have different default values:
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`;
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` or `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`.

In addition, there are 3 ways to import pages:
- through the **include** directive taken into account during translation: `<%@ include file="page.jsp" %>`;
- through the **include** action element when generating the response: `<jsp:include page="page.jsp" />`;
- or by importing the page with JSTL tag during response generation:
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

Based on the moment (translation/response) and selected (or not) character encoding, various problems can appear in different situations.
I recommend adding the `pageEncoding` and` contentType` parameters on each page (also on the included pages), while also remembering
about `charEncoding` during import.

## Testing
I recommend the [spring JSP demo](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp) for creating a test playground.
You can use a sample JSP template replacing the *hello.jsp* to fiddle with the encoding parameters:
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

Add the JSTL dependency and change the packaging to WAR, in case of deploying to a non-embedded server:

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

Next, we deploy it to the server or run it with the Maven wrapper: `./mvnw clean spring-boot: run` opening [http://localhost:8080/?name=Heizölrückstoßabdämpfung](http://localhost:8080/?name=Heiz%C3%B6lr%C3%BCcksto%C3%9Fabd%C3%A4mpfung).

An interesting thing is that Tomcat (9) and WebLogic (12/14) behave slightly differently in the absence of specific encoding.
When referencing bean attributes using EL syntax, e.g. `${utf8Variable}`, Tomcat seems to have no problems
with properly encoding the variable value during URL import – contrary to WebLogic.