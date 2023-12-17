---
title: Unclosable output stream in WebLogic's servlets
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

Attempting to write data to the servlet output stream in Java (obtained from
`javax.servlet.ServletResponse`), after the stream has been closed, will usually fail. Even though no specific exception is
thrown, the operation will simply be ignored. You will notice this behavior for example in the Tomcat server.

However, the servlet implementation in the WebLogic server differs from the one known from Tomcat. Closing the
stream, as well as its alternative in the form of the `PrintWriter` interface, is equivalent to no operation. After the
invocation, you can still provide output data, and it will eventually reach the client.

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
        /*below output is not printed on the Tomcat*/
        os.println("Hello World after stream close."
                + " Is the response committed? "
                + response.isCommitted());
    }
}
```

<img src="/img/hq/weblogic-servlet-output-close.png" title="The response from the servlet returned by the server" alt="The servlet response returned by the server containing the data sent after closing the output stream">

The behavior related to closing the stream can be changed to that known from Tomcat using the Java system
parameter` -Dweblogic.http.allowClosingServletOutputStream`. However, if you use the `PrintWriter`
interface please note that the support for this flag is not implemented there.

You can resolve this unintended response concatenation in multiple different ways:
- by creating a code structure (or integration configuration) that will avoid attempting to write to closed streams;
- saving, and verifying the stream state before writing, in a temporary attribute associated with the servlet request;
- creating a proxy/decorator for the `HttpServletResponse`, `ServletOutputStream`, and `PrintWriter` interfaces,
  replacing the implementation of `close()`, `write()`, and other `print()` methods, with the behavior known from the Tomcat [(analogous example)](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging);
- through a "fancy reflection" based on the provider's implementation (maybe not).

Some of these solutions seem better than others, but in the context of a particular application, they may prove to be difficult to adapt.

You will find the provider's implementation of this behavior in the `com.oracle.weblogic.servlet.jar` library under the standard server modules location `/u01/oracle/wlserver/modules/`.
The WebLogic installer is available on the Oracle website, and my preferred approach which is the pre-installed version in a docker image,
`container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11` can be obtained after creating an account and accepting the terms of use.