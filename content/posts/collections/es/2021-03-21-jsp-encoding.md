---
title: Codificación en JSP
url: jsp-codificacion
id: 62
category:
  - jee: JEE
tags:
  - weblogic
  - tomcat
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

Cuando desarrollamos una aplicación en tecnología JSP, normalmente el servidor de destino será un contenedor de servlets sencillo, como Tomcat. Si tu aplicación muestra caracteres especiales, diacríticos, etc., conviene verificar que se visualicen correctamente. Los servidores pueden interpretar de forma distinta las directivas en las plantillas JSP si no especificamos la codificación de manera precisa.

<img src="/img/hq/jsp-encoding.png" alt="Obrazek przedstawiający problemy z enkodowaniem znaków w JSP" title="JSP problemy z enkodowaniem">

## Codificación

En JSP, la codificación se controla mediante los atributos de la directiva `page`:
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – define la codificación de la página en tiempo de traducción y, si falta `contentType`, también en la respuesta del servidor;
- `contentType` – define la codificación durante la respuesta del servidor.

Según la extensión, estos parámetros pueden tener valores predeterminados diferentes:
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`;
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` o `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`.

Además, hay 3 formas de importar páginas:
- mediante la directiva **include** que se tiene en cuenta en tiempo de traducción: `<%@ include file="page.jsp" %>`;
- mediante el elemento de acción **include** al generar la respuesta: `<jsp:include page="page.jsp" />`;
- o importando la página con la etiqueta JSTL durante la generación de la respuesta:
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

Dependiendo del momento (traducción/respuesta) y de la codificación elegida (o no), pueden surgir problemas en distintas situaciones. Recomiendo añadir los parámetros `pageEncoding` y `contentType` en cada página (también en las incluidas), y recordar el `charEncoding` al importar.

## Pruebas
Recomiendo el [demo de JSP con Spring](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp) para crear un entorno de pruebas. Puedes usar una plantilla JSP de ejemplo reemplazando *hello.jsp* para experimentar con los parámetros de codificación:
```xml
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Prueba UTF-8</title>
</head>
<body>
    <h1>Página principal:</h1>
    <h3>dinámico: ${name}</h3>
    <h3>estático: Heizölrückstoßabdämpfung</h3>
    
    <h1>Include por directiva:</h1>
    <%@ include file="page.jsp" %>
    
    <h1>Include JSP:</h1>
    <jsp:include page="page.jsp"/>
    
    <h1>Importar:</h1>
    <c:import url="page.jsp" charEncoding="UTF-8"/>
</body>
</html>
```
*page.jsp*:
```html
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<h3>dinámico: ${name}</h3>
<h3>estático: Heizölrückstoßabdämpfung</h3>
```

Agrega la dependencia JSTL y cambia el empaquetado a WAR si vas a desplegar en un servidor no embebido:

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

Luego, despliega en el servidor o ejecútalo con Maven Wrapper: `./mvnw clean spring-boot: run` abriendo [http://localhost:8080/?name=Heizölrückstoßabdämpfung](http://localhost:8080/?name=Heiz%C3%B6lr%C3%BCcksto%C3%9Fabd%C3%A4mpfung).

Algo curioso es que Tomcat (9) y WebLogic (12/14) se comportan de forma ligeramente distinta si no se especifica la codificación. Al referenciar atributos de beans usando la sintaxis EL, por ejemplo `${utf8Variable}`, Tomcat no suele tener problemas para codificar correctamente el valor de la variable durante la importación por URL, a diferencia de WebLogic.
