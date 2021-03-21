---
title: Enkodowanie stron JSP
url: jsp-encoding
id: 62
tags:
  - java
  - weblogic
  - tomcat
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

Mając aplikację zbudowaną w technologii JSP, zazwyczaj naszym docelowym serwerem będzie prosty serwer implementujący kontener serwletowy, np.
Tomcat. Jeśli w naszej aplikacji wyświetlamy niestandardowe
znaki diakrytyczne, umlauty itp. to warto przetestować ją pod kątem poprawnego ich wyświetlania.
Serwery mogą różnie traktować nasze dyrektywy w szablonach JSP, jeśli precyzyjnie nie określimy kodowania.

<img src="/img/hq/jsp-encoding.png" alt="Picture showing JSP character encoding problems" title="JSP encoding problems">

## Enkodowanie

W przypadku JSP enkodowaniem sterujemy za pomocą dwóch atrybutów dyrektywy `page`: 
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – ustawia enkodowanie strony podczas translacji oraz podczas odpowiedzi serwera jeśli brakuje `contentType`;
- `contentType` – ustawia enkodowanie podczas odpowiedzi serwera.

W zależności, z jakim rozszerzeniem mamy do czynienia, parametry te mogą przyjmować inne wartości domyślne:
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`;
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` bądź `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`.

Oprócz tego mamy do wyboru 3 sposoby na zaimportowanie stron:
- dyrektywa **include** brana pod uwagę podczas translacji: `<%@ include file="page.jsp" %>`;
- element akcji **include** brany pod uwagę podczas generowania odpowiedzi: `<jsp:include page="page.jsp" />`; 
- tag JSTL importujący stronę podczas generowania odpowiedzi: 
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

W zależności od momentu i wybranego (bądź nie) enkodowania znaków, problemy objawiać się mogą w różnych sytuacjach.
Polecam na każdej stronie dodawać parametry `pageEncoding` oraz `contentType` (również w tych dołączanych), równocześnie pamiętając
o `charEncoding` podczas importu.

## Testy

Do przetestowania polecam [springowe demo JSP](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp).
Przykładowy template JSP do podmiany (*hello.jsp*):
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
    <h3>static: Zażółć gęślą jaźń</h3>
    
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
<h3>static: Zażółć gęślą jaźń</h3>
```

Dodajemy zależność JSTL i zmieniamy pakowanie na WAR, na wypadek deployu na wybrany serwer:

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

Następnie deployujemy na serwer bądź odpalamy za pomocą wrappera mavenowego: `./mvnw clean spring-boot:run` i otwieramy [http://localhost:8080/?name=Zażółć gęślą jaźń](http://localhost:8080/?name=Za%C5%BC%C3%B3%C5%82%C4%87%20g%C4%99%C5%9Bl%C4%85%20ja%C5%BA%C5%84).

Warto zauważyć, ciekawą rzecz, mianowicie Tomcat (9) i WebLogic (12/14) nieco inaczej zachowują się w przypadku braku wybranego enkodowania.
W sytuacji, gdy odwołujemy się do atrybutów beanów za pomocą składni EL, np. `${utf8Variable}`, Tomcat zdaje się nie mieć problemów
z właściwym enkodowaniem wartości zmiennej podczas importu – przeciwnie do WebLogica.