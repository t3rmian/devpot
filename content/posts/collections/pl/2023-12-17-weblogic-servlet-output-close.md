---
title: Niezamykalny strumień wyjścia w serwletach na WebLogicu
url: weblogic-servlet-output-close
id: 122
category:
  - jee: JEE
tags:
  - weblogic
  - serwlety
author: Damian Terlecki
date: 2023-12-17T20:00:00
---

W przypadku serwletów w Javie próba wypisania danych do strumienia wyjścia (pozyskanego z `javax.servlet.ServletResponse`), po zamknięciu tego
strumienia, zazwyczaj kończy się niepowodzeniem. Mimo braku zgłoszenia konkretnego wyjątku
operacja zostanie po prostu zignorowana. Takie zachowanie ma miejsce na przykład na serwerze Tomcat.

Implementacja serwletów na serwerze WebLogic odbiega jednak od tej znanej z Tomcata.
Zamknięcie strumienia, jak również jego alternatywy pod postacią interfejsu `PrintWriter` jest równoznaczne z brakiem operacji.
Po wywołaniu ciągle możemy podawać dane na wyjściu i zazwyczaj trafią one do klienta.



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

<img src="/img/hq/weblogic-servlet-output-close.png" title="Odpowiedź z serwletu zwrócona przez serwer" alt="Odpowiedź serwletu zwrócona przez serwer zawierająca dane przesłane po zamknięciu strumienia wyjścia">

O ile zachowanie związane z zamknięciem strumienia możemy zmienić na te znane z Tomcata za pomocą parametru systemowego Javy `-Dweblogic.http.allowClosingServletOutputStream`,
to nie jest on brany pod uwagę przy korzystaniu z interfejsu `PrintWriter`.

Problem tej niezamierzonej konkatenacji odpowiedzii możemy rozwiązać na kilka różnych sposobów:
- poprzez stworzenie takiej struktury kodu i integracji z wybranym frameworkiem, która uniknie prób zapisu do zamkniętych strumieni;
- zapisanie i weryfikacja stanu strumienia w tymczasowym atrybucie powiązanym z zapytaniem;
- stworzenie proxy/dekoratora interfejsów `HttpServletResponse`, `ServletOutputStream` i `PrintWriter`,
zastępujących implementację metod `close()`, `write()` i innych typu `print()`, zachowaniem znanym z Tomcata [(przykład analogiczny)](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging).

Niektóre z tych rozwiązań wydają się lepsze od innych, ale w kontekście właściwej aplikacji mogą okazać się trudne do dostosowania.

Implementację omawianego zachowania strumieni znajdziesz w bibliotece `com.oracle.weblogic.servlet.jar` w standardowej lokalizacji modułów serwera `/u01/oracle/wlserver/modules/`.
Instalator serwera WebLogic dostępny jest na stronie Oracle, a preinstalowana werjsa także w obrazie
dockerowym `container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11` (po założeniu konta i akceptacji warunków użytkowania).