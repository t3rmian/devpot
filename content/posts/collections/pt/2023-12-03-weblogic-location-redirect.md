---
title: Protocolo de redirecionamento de servlet no WebLogic
url: weblogic-redirecionamento-servlet-https
id: 121
category:
- jee: JEE
tags:
- weblogic
- servlets
author: Damian Terlecki
date: 2023-12-03T20:00:00
---


No desenvolvimento web, o navegador redireciona automaticamente quando recebe uma resposta com um cabeçalho "Location" para alguns
códigos de status HTTP. Códigos que acionam o redirecionamento automático começam com 3. Ao usar uma API de Servlet Java, ou seja, `javax.servlet.http.HttpServletResponse.sendRedirect(String)`,
geralmente será um 302.

Quando você migra sua aplicação servlet de algo como o Tomcat para o WebLogic, pode se deparar com uma
peculiaridade que faz com que o cabeçalho "Location" seja avaliado como uma URL absoluta. Infelizmente, isso pode não
funcionar bem com um proxy reverso que termina o SSL e se conecta ao WebLogic na porta HTTP.

<img src="/img/hq/browser-mixed-content.png" title="Navegadores bloquearão requisições que causam downgrade de HTTPS com erros de conteúdo misto ao incluir recursos ou usar AJAX" alt="Navegadores web bloqueiam conteúdo misto para aumentar a segurança e privacidade dos usuários durante a navegação em sites. Conteúdo misto refere-se a uma página web carregada com protocolo seguro (HTTPS) que contém elementos não seguros (HTTP). Quando uma página web segura (carregada sobre HTTPS) inclui recursos (como imagens, scripts, folhas de estilo, bem como redirecionamentos de localização AJAX) de uma conexão insegura (HTTP), cria-se uma vulnerabilidade de segurança.">

## Redirecionamento com URL absoluta no WebLogic

O servlet no WebLogic pode redirecionar para um 'Location' com protocolo HTTP, mesmo que você se conecte através de um
proxy reverso HTTPS (independentemente dos cabeçalhos encaminhados).
Suponha que enviemos um POST para https://example.com/app/foo, que seria um servlet do WebLogic invocando `sendRedirect("bar")` por trás de um proxy reverso:

```shell
#  Cabeçalhos da requisição (com cabeçalhos não relacionados omitidos para brevidade)
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

Requisição do proxy reverso:
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

Mesmo que os cabeçalhos encaminhados estejam presentes, o WebLogic responde com um 'location' HTTP em vez de HTTPS:
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## Soluções para redirecionamento de conteúdo misto

Você pode encontrar várias soluções para isso:
- Reescrever o cabeçalho da resposta no proxy.
- Implementar um filtro personalizado que reescreverá o cabeçalho da resposta.
- Ativar a opção "WebLogic Plugin Enabled" no console do WebLogic e adicionar o cabeçalho de requisição "WL-Proxy-SSL: ON" no proxy.
- Adicionar host e porta de front-end WL no console do WebLogic.

No entanto, após examinar o conteúdo da biblioteca de servlet fornecida,
percebi que a solução mais segura e simples era desabilitar a avaliação de URL absoluta durante o redirecionamento.

> Para depurar isso, coloquei um breakpoint no método `sendRedirect()`, executei um `getClass().getProtectionDomain().getCodeSource().getLocation()` arbitrário.
> Dada a localização da implementação de `HttpServletResponse`, adicionei-a ao classpath no meu IDE:
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (da imagem oficial 12.1.2.4 do docker).

Acontece que você pode fazer isso no descritor da aplicação web `WEB-INF/weblogic.xml`, desta forma (troque a versão `1.9` do XSD por uma versão
[compatível com o seu WebLogic](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)):

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

> Comentário do arquivo XSD: Se o elemento redirect-with-absolute-url for definido como false, o contêiner de servlet não converterá a URL relativa para a URL absoluta no cabeçalho de localização em um redirecionamento.
