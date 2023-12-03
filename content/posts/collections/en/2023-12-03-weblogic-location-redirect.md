---
title: Servlet redirection protocol on the WebLogic
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


In web development, the browser automatically redirects when it receives a response with a "Location" header for some
HTTP status codes. Codes that trigger automatic redirection start with 3. When using a Java Servlet API, i.e., `javax.servlet.http.HttpServletResponse.sendRedirect(String)`, it will
usually be a 302.

When you migrate your servlet application from something like Tomcat to the WebLogic, you might come across a
quirk that causes "Location" header to evaluate to an absolute URL. Unfortunately, it might not
play well with a reverse-proxy that terminates SSL and connects to the WebLogic on the HTTP port.

<img src="/img/hq/browser-mixed-content.png" title="Browsers will block requests that cause HTTPS downgrade with mixed-content errors when including resources or using AJAX" alt="Web browsers block mixed content to enhance the security and privacy of users while browsing websites. Mixed content refers to a web page loaded with secure (HTTPS) protocol containing non-secure (HTTP) elements. When a secure web page (loaded over HTTPS) includes resources (such as images, scripts, stylesheets as well as AJAX location redirects) from an insecure connection (HTTP), it creates a security vulnerability.">

## WebLogic absolute URL redirect

The servlet on the WebLogic may redirect to a Location with HTTP protocol even though you connect through an HTTPS
reverse proxy (regardless of the forwarded headers).
Suppose we send a POST to the https://example.com/app/foo, which would be a WebLogic servlet invoking `sendRedirect("bar")` from behind a reverse-proxy:

```shell
#  Request headers (with unrelated headers skipped for brevity)
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

Request from the reverse-proxy:
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

Even though the forwarded headers are present, WebLogic responds with an HTTP location instead of HTTPS:
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## Mixed-content redirect solutions

You can find various solutions to this:
- Rewrite the response header on the proxy.
- Implement a custom filter that will rewrite the response header.
- Turn on "WebLogic Plugin Enabled" option in the WebLogic console and add the "WL-Proxy-SSL: ON" request header on the proxy.
- Add WL front end host and port in the WebLogic console.

However, after examining the contents of the provided servlet library,
I realized that the safest and simplest solution was to disable the absolute URL evaluation during the redirection.

> To debug this, I put a breakpoint on `sendRedirect()` method, executed arbitrary `getClass().getProtectionDomain().getCodeSource().getLocation()`.
> Given the location of the `HttpServletResponse` implementation I added it to the classpath in my IDE:
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (from the official 12.1.2.4 image docker).

Turns out you can do this in the `WEB-INF/weblogic.xml` web application descriptor, like so (swap the `1.9` XSD version with a version
[compatible with your WebLogic](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)):

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

> Comment from the XSD file: If the redirect-with-absolute-url element is set to false, then the servlet container will not convert the relative url to the absolute url in the location header in a redirect.