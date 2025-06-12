---
title: Protocolo de redirección de servlets en WebLogic
url: weblogic-servlet-redirect-https
id: 121
category:
  - jee: JEE
tags:
  - weblogic
  - servlets
author: Damian Terlecki
date: 2023-12-03T20:00:00
---

En desarrollo web, el navegador redirige automáticamente cuando recibe una respuesta con una cabecera "Location" para ciertos códigos de estado HTTP. Los códigos que disparan una redirección automática empiezan por 3. Cuando usas la API de Java Servlet, es decir, `javax.servlet.http.HttpServletResponse.sendRedirect(String)`, normalmente será un 302.

Al migrar tu aplicación de servlets de algo como Tomcat a WebLogic, puedes encontrarte con una peculiaridad que hace que la cabecera "Location" se evalúe como una URL absoluta. Desafortunadamente, esto puede no funcionar bien con un reverse-proxy que termina SSL y conecta con WebLogic por el puerto HTTP.

<img src="/img/hq/browser-mixed-content.png" title="Los navegadores bloquean peticiones que provocan downgrade de HTTPS con errores de mixed-content al incluir recursos o usar AJAX" alt="Los navegadores web bloquean contenido mixto para mejorar la seguridad y privacidad de los usuarios. El contenido mixto ocurre cuando una página segura (HTTPS) incluye elementos no seguros (HTTP). Esto crea una vulnerabilidad si una página segura incluye recursos o redirecciones AJAX desde una conexión insegura.">

## Redirección absoluta de URL en WebLogic

El servlet en WebLogic puede redirigir a una Location con protocolo HTTP aunque te conectes a través de un reverse proxy HTTPS (sin importar los headers reenviados).
Supón que enviamos un POST a https://example.com/app/foo, que sería un servlet de WebLogic invocando `sendRedirect("bar")` detrás de un reverse-proxy:

```shell
#  Cabeceras de la petición (otras omitidas por brevedad)
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

Petición desde el reverse-proxy:
```shell
POST /app/foo HTTP/1.1
Host: [example.com]
X-forwarded-host: [example.com]
Upgrade-insecure-requests: [1]
X-forwarded-server: [example.com]
X-forwarded-for: [192.168.0.100]
X-forwarded-proto: [https]
X-forwarded-ssl: [on]
```

Aunque los headers reenviados están presentes, WebLogic responde con una location HTTP en vez de HTTPS:
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## Soluciones para redirección con mixed-content

Puedes encontrar varias soluciones para esto:
- Reescribir la cabecera de respuesta en el proxy.
- Implementar un filtro personalizado que reescriba la cabecera de respuesta.
- Activar la opción "WebLogic Plugin Enabled" en la consola de WebLogic y añadir la cabecera "WL-Proxy-SSL: ON" en el proxy.
- Añadir el host y puerto front-end de WL en la consola de WebLogic.

Sin embargo, tras revisar el contenido de la librería de servlets proporcionada,
me di cuenta de que la solución más simple y segura era desactivar la evaluación de URL absoluta durante la redirección.

> Para depurar esto, puse un breakpoint en el método `sendRedirect()`, ejecuté un `getClass().getProtectionDomain().getCodeSource().getLocation()` arbitrario.
> Dada la ubicación de la implementación de `HttpServletResponse`, la añadí al classpath en mi IDE:
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (de la imagen oficial 12.1.2.4 docker).

Resulta que puedes hacer esto en el descriptor de la aplicación web `WEB-INF/weblogic.xml`, así (cambia la versión XSD `1.9` por una
[compatible con tu WebLogic](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                  http://xmlns.oracle.com/weblogic/weblogic-web-app/1.9/weblogic-web-app.xsd">
    <context-root>/app</context-root>
    <container-descriptor>
        <redirect-with-absolute-url>false</redirect-with-absolute-url>
    </container-descriptor>
</weblogic-web-app>
```

> Comentario del archivo XSD: Si el elemento redirect-with-absolute-url está en false, el contenedor de servlets no convertirá la url relativa en absoluta en la cabecera location de una redirección.
