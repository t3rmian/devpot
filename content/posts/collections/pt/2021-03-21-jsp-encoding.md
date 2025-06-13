---
title: Codificação em JSP
url: codificacao-jsp
id: 62
category:
- jee: JEE
tags:
- weblogic
- tomcat
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

Tendo uma aplicação construída em tecnologia JSP, geralmente nosso servidor de destino será um servidor simples que implementa um contêiner de servlets, por exemplo, o Tomcat. Se exibirmos diacríticos não padrão, tremas, etc. em nossa aplicação, vale a pena verificar sua exibição correta. Os servidores podem tratar nossas diretivas em templates JSP de forma diferente se não especificarmos a codificação com precisão.

<img src="/img/hq/jsp-encoding.png" alt="Imagem mostrando problemas com codificação de caracteres em JSP" title="JSP problemas de codificação">

## Codificação

No caso de JSP, a codificação é controlada através dos atributos da diretiva `page`:
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – define a codificação da página durante o tempo de tradução e, se `contentType` estiver ausente, também durante o tempo de resposta do servidor;
- `contentType` – define a codificação durante a resposta do servidor.

Dependendo da extensão, esses parâmetros podem ter valores padrão diferentes:
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`;
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` ou `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`.

Além disso, existem 3 maneiras de importar páginas:
- através da diretiva **include**, levada em conta durante a tradução: `<%@ include file="page.jsp" %>`;
- através do elemento de ação **include** ao gerar a resposta: `<jsp:include page="page.jsp" />`;
- ou importando a página com a tag JSTL durante a geração da resposta:
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

Com base no momento (tradução/resposta) e na codificação de caracteres selecionada (ou não), vários problemas podem aparecer em diferentes situações. Recomendo adicionar os parâmetros `pageEncoding` e `contentType` em cada página (também nas páginas incluídas), lembrando também de `charEncoding` durante a importação.

## Testando
Recomendo a [demonstração JSP do Spring](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp) para criar um ambiente de testes. Você pode usar um template JSP de amostra substituindo o *hello.jsp* para brincar com os parâmetros de codificação:
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
    <h1>Página principal:</h1>
    <h3>dinâmico: ${name}</h3>
    <h3>estático: Heizölrückstoßabdämpfung</h3>
    
    <h1>Diretiva include:</h1>
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
<h3>dinâmico: ${name}</h3>
<h3>estático: Heizölrückstoßabdämpfung</h3>
```

Adicione a dependência JSTL e mude o empacotamento para WAR, no caso de implantação em um servidor não embarcado:

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

Em seguida, implantamos no servidor ou executamos com o wrapper do Maven: `./mvnw clean spring-boot: run` abrindo [http://localhost:8080/?name=Heizölrückstoßabdämpfung](http://localhost:8080/?name=Heiz%C3%B6lr%C3%BCcksto%C3%9Fabd%C3%A4mpfung).

Uma coisa interessante é que o Tomcat (9) e o WebLogic (12/14) se comportam de maneira ligeiramente diferente na ausência de codificação específica. Ao referenciar atributos de bean usando a sintaxe EL, por exemplo, `${utf8Variable}`, o Tomcat parece não ter problemas em codificar corretamente o valor da variável durante a importação da URL – ao contrário do WebLogic.
