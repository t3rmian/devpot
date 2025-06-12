---
title: Flujo de salida no cerrable en los servlets de WebLogic
url: weblogic-servlet-output-close
id: 122
category:
  - jee: JEE
tags:
  - weblogic
  - servlets
author: Damian Terlecki
date: 2023-12-17T20:00:00
---

Intentar escribir datos en el flujo de salida del servlet en Java (obtenido de
`javax.servlet.ServletResponse`), después de que el flujo haya sido cerrado, normalmente fallará. Aunque no se lanza una excepción específica,
la operación simplemente será ignorada. Puedes notar este comportamiento, por ejemplo, en el servidor Tomcat.

Sin embargo, la implementación de servlets en el servidor WebLogic difiere de la conocida en Tomcat. Cerrar el
flujo, así como su alternativa en forma de la interfaz `PrintWriter`, es equivalente a no hacer nada. Después de la
invocación, aún puedes enviar datos de salida y estos finalmente llegarán al cliente.

```java
import javax.servlet.ServletOutputStream;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@WebServlet(name = "HelloWorldServlet", urlPatterns = "/hello")
public class HelloWorldServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request,
                         HttpServletResponse response)
            throws IOException {
        ServletOutputStream os = response.getOutputStream();
        os.println("Hello World");
        os.flush();
        os.close();
        /*el siguiente output no se imprime en Tomcat*/
        os.println("Hello World after stream close."
                + " Is the response committed? "
                + response.isCommitted());
    }
}
```

<img src="/img/hq/weblogic-servlet-output-close.png" title="La respuesta del servlet devuelta por el servidor" alt="La respuesta del servlet devuelta por el servidor que contiene los datos enviados después de cerrar el flujo de salida">

El comportamiento relacionado con el cierre del flujo puede cambiarse al conocido de Tomcat usando el parámetro de sistema Java `-Dweblogic.http.allowClosingServletOutputStream`. Sin embargo, si usas la interfaz `PrintWriter`, ten en cuenta que el soporte para este flag no está implementado ahí.

Puedes resolver esta concatenación no deseada de respuestas de varias formas:
- creando una estructura de código (o configuración de integración) que evite intentar escribir en flujos cerrados;
- guardando y verificando el estado del flujo antes de escribir, en un atributo temporal asociado a la petición del servlet;
- creando un proxy/decorador para las interfaces `HttpServletResponse`, `ServletOutputStream` y `PrintWriter`,
  reemplazando la implementación de `close()`, `write()` y otros métodos `print()`, con el comportamiento conocido de Tomcat [(ejemplo análogo)](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging);
- mediante una "reflexión creativa" basada en la implementación del proveedor (quizás no recomendado).
