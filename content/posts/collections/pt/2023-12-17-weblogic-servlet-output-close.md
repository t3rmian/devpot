---
title: Fluxo de saída que não pode ser fechado em servlets do WebLogic
url: weblogic-servlet-output-fechar
id: 122
category:
- jee: JEE
tags:
- weblogic
- servlets
author: Damian Terlecki
date: 2023-12-17T20:00:00
---

Tentar escrever dados no fluxo de saída do servlet em Java (obtido de
`javax.servlet.ServletResponse`), após o fluxo ter sido fechado, geralmente falhará. Embora nenhuma exceção específica seja
lançada, a operação será simplesmente ignorada. Você notará esse comportamento, por exemplo, no servidor Tomcat.

No entanto, a implementação de servlet no servidor WebLogic difere daquela conhecida do Tomcat. Fechar o
fluxo, bem como sua alternativa na forma da interface `PrintWriter`, é equivalente a uma operação nula. Após a
invocação, você ainda pode fornecer dados de saída, e eles eventualmente chegarão ao cliente.

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
        /*a saída abaixo não é impressa no Tomcat*/
        os.println("Hello World after stream close."
                + " Is the response committed? "
                + response.isCommitted());
    }
}
```

<img src="/img/hq/weblogic-servlet-output-close.png" title="A resposta do servlet retornada pelo servidor" alt="A resposta do servlet retornada pelo servidor contendo os dados enviados após fechar o fluxo de saída">

O comportamento relacionado ao fechamento do fluxo pode ser alterado para aquele conhecido do Tomcat usando o parâmetro de sistema Java
`-Dweblogic.http.allowClosingServletOutputStream`. No entanto, se você usar a interface `PrintWriter`,
observe que o suporte para este sinalizador não está implementado lá.

Você pode resolver essa concatenação não intencional da resposta de várias maneiras diferentes:
- criando uma estrutura de código (ou configuração de integração) que evitará a tentativa de escrever em fluxos fechados;
- salvando e verificando o estado do fluxo antes de escrever, em um atributo temporário associado à requisição do servlet;
- criando um proxy/decorator para as interfaces `HttpServletResponse`, `ServletOutputStream` e `PrintWriter`,
  substituindo a implementação dos métodos `close()`, `write()` e outros `print()`, com o comportamento conhecido do Tomcat [(exemplo análogo)](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging);
- através de uma "reflexão sofisticada" baseada na implementação do provedor (talvez não).

Algumas dessas soluções parecem melhores que outras, mas no contexto de uma aplicação específica, elas podem se mostrar difíceis de adaptar.

Você encontrará a implementação desse comportamento pelo provedor na biblioteca `com.oracle.weblogic.servlet.jar` sob a localização padrão dos módulos do servidor `/u01/oracle/wlserver/modules/`.
O instalador do WebLogic está disponível no site da Oracle, e minha abordagem preferida, que é a versão pré-instalada em uma imagem docker,
`container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11`, pode ser obtida após criar uma conta e aceitar os termos de uso.
