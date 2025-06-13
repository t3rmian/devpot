---
title: Exemplos de cliente SOAP com SAAJ, CXF e Camel
url: exemplos-cliente-soap-saaj-cxf-camel
id: 107
category:
- java: Java
tags:
- camel
- cxf
- web-services
- soap
- jaxb
- xml
- jaxws
- jakarta
author: Damian Terlecki
date: 2023-03-31T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

Ao lidar com grandes sistemas legados que normalmente têm arquitetura monolítica, levando a uma velocidade de entrega mais lenta,
é útil ter uma ferramenta confiável para implementar soluções de integração temporárias.
O suporte do Camel a múltiplos protocolos e formatos de dados permite a integração fácil com sistemas diversos.
Além disso, o modo autônomo (standalone) não requer interferência na infraestrutura existente.
Isso torna o Camel ideal para construir soluções temporárias, para as quais ele traz vários padrões de integração como polling,
splitter, throttle, circuit breaker e muitos outros.

O SOAP, no contexto de sistemas mais antigos, é um dos protocolos de troca de dados mais populares (em termos de frequência de ocorrência).
Em combinação com XML, a implementação da comunicação com tal web service muitas vezes não é tão rápida quanto
com uma arquitetura REST típica baseada no protocolo HTTP. Ainda mais quando você precisa de uma solução temporária rápida
preparada do zero.

## SAAJ

Embora o Java ofereça um conjunto de interfaces chamado SAAJ (*SOAP with Attachments API for Java*) para comunicação SOAP, é uma
API de baixo nível sob o pacote `javax.xml.soap`. Para ser claro, não é muito
prática para estruturas complexas de requisição e resposta. Também não possui um recurso de validação para documentos XML/XSD.

Mas vamos ver alguns exemplos.
Temos um servidor com um web service SOAP do meu repositório de amostras https://github.com/t3rmian/jmeter-samples.
O serviço escuta e responde a requisições de exemplo:

<img src="/img/hq/soap-request-response.png" title='Exemplo de consulta e resposta SOAP' alt='<!--getUser_4_smith_request.xml Request-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--Response-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

As classes necessárias para implementar a comunicação a partir do nível do cliente usando SAAJ e um código auto-descritivo podem se parecer com isto:

```java
import javax.xml.namespace.QName;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPBody;
import javax.xml.soap.SOAPBodyElement;
import javax.xml.soap.SOAPConnection;
import javax.xml.soap.SOAPConnectionFactory;
import javax.xml.soap.SOAPConstants;
import javax.xml.soap.SOAPElement;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;
import org.junit.Test;

import java.net.MalformedURLException;
import java.net.URL;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    static final String NS = "https://github.com/t3rmian/jmeter-samples";
    
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingSAAJ_Then_returnSmithName() throws SOAPException, MalformedURLException {
        SOAPMessage soapMessage = createGetUserSAAJMessage(EXISTING_USER_ID);
        URL endpointUrl = new URL(System.getProperty("wsEndpointAddress"));
        SOAPConnectionFactory soapConnectionFactory = SOAPConnectionFactory.newInstance();
        SOAPConnection soapConnection = soapConnectionFactory.createConnection();

        SOAPMessage response = soapConnection.call(soapMessage, endpointUrl);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSAAJMessage(long userId) throws SOAPException {
        MessageFactory messageFactory = MessageFactory.newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        SOAPBody body = envelope.getBody();
        SOAPBodyElement getUserRequest = body.addBodyElement(new QName(NS, "getUserRequest"));
        SOAPElement id = getUserRequest.addChildElement(new QName(NS, "id"));
        id.setTextContent(String.valueOf(userId));
        return soapMessage;
    }
}
```
Para usar esta API de forma eficaz, lembre-se de utilizar namespaces durante a criação de elementos e ao procurar elementos na resposta.
Omiti-los resultará na rejeição da requisição ou na incapacidade de encontrar o elemento ao ler, o que pode ser desastroso para partes opcionais.

> Na evolução contínua da plataforma Java, o SAAJ foi preterido e depois [removido](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4) do Java SE 11 e não é mais fornecido com o JDK. Este pacote foi extraído para um artefato separado `javax.xml.soap:javax.xml.soap-api`, que você pode encontrar no Repositório Central do Maven.

## JAX-WS e Apache CXF

CXF (um acrônimo criado a partir da fusão dos produtos Celtix e XFire de 2006) como um framework para construir web services e clientes permite uma implementação muito mais rápida
da comunicação, especialmente
ao lidar com estruturas e extensões avançadas, por exemplo, WSS. No escopo das interfaces padrão (até o Java 11),
ele também serve como um provedor para JAX-WS (Java API for XML Web Services).

Em termos de ferramentas, o Apache CXF oferece um plugin Maven `org.apache.cxf:cxf-codegen` para gerar classes Java que representam um web service a partir de arquivos WSDL/XSD.

```xml
<plugin>
    <groupId>org.apache.cxf</groupId>
    <artifactId>cxf-codegen-plugin</artifactId>
    <version>3.5.5</version>
    <executions>
        <execution>
            <id>generate-sources</id>
            <phase>generate-sources</phase>
            <configuration>
                <wsdlOptions>
                    <wsdlOption>
                        <wsdl>
                            ${basedir}/src/main/resources/users.wsdl
                        </wsdl>
                    </wsdlOption>
                </wsdlOptions>
            </configuration>
            <goals>
                <goal>wsdl2java</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

> Um IDE (por exemplo, IntelliJ) normalmente não invoca este plugin automaticamente. Você pode usar o Maven diretamente ou incluir manualmente este passo em sua configuração de execução.

Para implementar o cliente, você precisará de artefatos do grupo `org.apache.cxf`:
- `cxf-core` – classes responsáveis pelo processamento, mapeamento e manipulação de protocolos;
- `cxf-rt-frontend-jaxws` – classes do cliente;
- `cxf-rt-databinding-jaxb` – mapeamento XML;
- `cxf-rt-transports-http` – comunicação HTTP;
- `cxf-rt-transports-soap` – suporte SOAP;
- `cxf-rt-features-logging` – extensão de log de mensagens.

> Se você está enfrentando um erro como `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2 .runtime.reflect.opt.Injector.defineClass" is null`, dê uma olhada nas soluções em https://github.com/eclipse-ee4j/jaxb-ri/issues/1197.  
> Minha solução alternativa de exemplo foi adicionar o artefato `com.sun.xml.bind:jaxb-xjc` relacionado à geração de código Java a partir de arquivos XML, além da dependência transitiva JAXB `jaxb-runtime`. Embora as classes já estejam geradas nos exemplos fornecidos, executá-las em uma versão diferente do Java pode causar um erro interno devido à implementação do JAXB tentar otimizar o acesso usando classes ausentes.

Desta vez, o código é muito mais simples. Usamos os DTOs gerados pelo plugin. Além disso, ao referenciar a implementação do CXF,
você tem a oportunidade de configurar o cliente (timeout, logging, SSL):

```java
import https.github_com.t3rmian.jmeter_samples.CommonFault;
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.Users;
import https.github_com.t3rmian.jmeter_samples.UsersService;
import org.apache.cxf.ext.logging.LoggingFeature;
import org.apache.cxf.frontend.ClientProxy;
import org.apache.cxf.transport.http.HTTPConduit;

import javax.xml.ws.BindingProvider;
import javax.xml.ws.WebServiceFeature;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCxf_Then_returnSmithName() throws CommonFault {
        UserPayload userPayload = new UserPayload();
        userPayload.setId(EXISTING_USER_ID);

        Users users = new UsersService().getUsersSoap11(getCxfLoggingFeature());
        ((HTTPConduit) ClientProxy.getClient(users).getConduit())
                .getClient().setReceiveTimeout(1000L);
        BindingProvider bindingProvider = (BindingProvider) users;
        bindingProvider.getRequestContext()
                .put(BindingProvider.ENDPOINT_ADDRESS_PROPERTY,
                        System.getProperty("wsEndpointAddress"));
        User user = users.getUser(userPayload);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static WebServiceFeature getCxfLoggingFeature() {
        LoggingFeature loggingFeature = new LoggingFeature();
        loggingFeature.setPrettyLogging(true);
        loggingFeature.setVerbose(true);
        loggingFeature.setLogMultipart(true);
        return loggingFeature;
    }
}
```

## Camel e SOAP

O Camel complementa a comunicação com web services SOAP através de seus padrões de integração.
Graças a eles, você pode buscar dados do banco de dados ou implementar uma ponte entre dois endpoints diferentes.
A partir da versão 3.18, as dependências necessárias para a integração com o CXF foram [divididas](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf) (CAMEL-9627) em vários pacotes menores.
Versões anteriores, também a 2.x (que suporta Java 8), exigiam apenas um único artefato, ou seja, `org.apache.camel:camel-cxf`.
Qualquer artefato com `soap` (3.18+) em seu nome funcionará para nossos exemplos.

O conceito de caminhos URI para o fluxo de mensagens entre endpoints permite muitas opções de configuração.
Vamos considerar os formatos de dados que definem como construir a mensagem.
Você pode escolher um dos quatro formatos.
- RAW/MESSAGE - permite enviar e receber mensagens em formato bruto, por exemplo, `String`;
- POJO - POJO como no exemplo do CXF;
- PAYLOAD - documentos XML `org.w3c.dom` representando o corpo SOAP que você pode carregar no camel `CxfPayload`;
- CXF_MESSAGE – envelope SOAP do pacote `javax.xml.soap`.

Cada formato de dados tem seu próprio conjunto de regras, como a aplicação de interceptores do CXF. Você pode ler sobre eles na [documentação](https://camel.apache.org/components/3.20.x/cxf-component.html).
No entanto, para começar, é fundamental examinar alguns exemplos de implementações de cliente.

> Outra maneira é envolver a comunicação direta do CXF em um bean e vinculá-lo a uma rota do camel.

### RAW/MESSAGE

O formato `RAW` funciona bem para enviar mensagens na forma de texto, carregado, por exemplo, de um arquivo.
Você receberá um texto em resposta que, embora rápido de implementar, pode não ser adequado para acessá-lo para outros fins.

No entanto, antes de enviar os dados, você precisa criar uma URI com a qual o Camel enviará os dados para o lugar certo.

```java
import org.apache.camel.CamelContext;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.impl.DefaultCamelContext;

import static org.hamcrest.CoreMatchers.containsString;
import static org.hamcrest.MatcherAssert.assertThat;

public class CamelSoapClientIT {

    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfRawFormat_Then_returnSmithName() throws Exception {
        String message = getTestResourceContent("getUser_4_smith_request.xml");

        try (CamelContext camelContext = new DefaultCamelContext()) {
            camelContext.addRoutes(new RouteBuilder() {
                @Override
                public void configure() {
                    from("direct:getUser")
                            .log("Body before cxf route: ${body}")
                            .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
                            .to(getCxfUriWithVerboseLoggingOfDataFormat(DataFormat.RAW))
                            .log("Body after cxf route: ${body}");
                }
            });
            camelContext.start();
            String response = camelContext.createProducerTemplate()
                    .requestBody("direct:getUser", message, String.class);

            assertThat(response, containsString(String.valueOf(EXISTING_USER_ID)));
            assertThat(response, containsString(EXISTING_USER_NAME));
        }
    }

    static String getCxfUriWithVerboseLoggingOfDataFormat(DataFormat dataFormat) {
        return getCxfUri(dataFormat) +
                "&cxfConfigurer=#class:io.github.t3rmian.jmetersamples.CxfTimeoutConfigurer";
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}/UsersSoap11?dataFormat=" + dataFormat;
    }
}
```

A URI começa com o componente `cxf` auto-registrado com a dependência incluída. A expressão `{{wsEndpointAddress}}` permite que você carregue a variável de ambiente ou
uma Propriedade Java, por exemplo, `http://localhost:8080/ws/users`. O `cxfConfigurer` será descrito mais tarde. Por enquanto, apenas observe que esta é uma configuração para um modo de despacho genérico do CXF,
útil para enviar estruturas arbitrárias não vinculadas a um esquema específico.

### POJO

O formato `POJO`, em sua simplicidade, permite o uso de classes geradas pelo plugin `cxf-codegen-plugin`.
No entanto, você precisa ajustar a configuração da URI para que a ligação adequada possa ser feita.

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.User;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPOJOFormat_Then_returnSmithName() throws Exception {
        UserPayload userPayload = new ObjectFactory().createUserPayload();
        userPayload.setId(EXISTING_USER_ID);

        //... .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
        User user = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", userPayload, User.class);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}"
                + "?wsdlURL=classpath:users.wsdl"
                + "&serviceClass=https.github_com.t3rmian.jmeter_samples.Users"
                + "&dataFormat=" + dataFormat;
    }
}
```

Sob o caminho `wsdlURL`, há um arquivo de classpath que descreve o serviço SOAP.
Em seguida, o parâmetro `serviceClass` determina a implementação do cliente, e é obrigatório apenas para o formato `POJO`.

Com base nos cabeçalhos `CxfConstants.OPERATION_NAME` e `CxfConstants.OPERATION_NAMESPACE`, o Camel/CXF associará a
mensagem com a operação apropriada. Caso contrário, ele fará uma suposição educada. Da mesma forma, você pode definir o cabeçalho HTTP `SOAPAction`
com `SoapBindingConstants.SOAP_ACTION` (SOAP 1.1) caso seja exigido pelo servidor (por exemplo, múltiplas operações sob um serviço).
O parâmetro equivalente para SOAP 1.2 é `SoapBindingConstants.PARAMETER_ACTION`.

### PAYLOAD

Preparar uma mensagem no formato `PAYLOAD` é mais desafiador. Comece construindo um documento XML e carregue-o em um `CxfPayload`.
Da mesma forma, passe os cabeçalhos como primeiro argumento para o construtor.
Leia a resposta de uma maneira típica de XML e procure por elementos na resposta por um determinado nome e namespace.

```java
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.apache.camel.component.cxf.common.CxfPayload;
import org.apache.cxf.binding.soap.SoapHeader;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.dom.DOMSource;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPayloadFormat_Then_returnSmithName() throws Exception {
        List<Source> outElements = new ArrayList<>();
        Document outDocument = createGetUserXmlDocument(EXISTING_USER_ID);
        outElements.add(new DOMSource(outDocument.getDocumentElement()));
        CxfPayload<SoapHeader> payload = new CxfPayload<>(null, outElements, null);
        
        //...
        CxfPayload<Element> response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", payload, CxfPayload.class);
        Element getUserResponse = response.getBody().get(0);

        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static Document createGetUserXmlDocument(long existingUserId)
            throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.newDocument();
        document.setXmlVersion("1.1");

        Element rootElement = document.createElementNS(NS, "getUserRequest");
        document.appendChild(rootElement);

        Element childElement = document.createElementNS(NS, "id");
        childElement.appendChild(document.createTextNode(String.valueOf(existingUserId)));
        rootElement.appendChild(childElement);

        return document;
    }
}
```

### CXF_MESSAGE

O formato `CXF_MESSAGE` parece bastante semelhante ao `PAYLOAD`, mas desta vez as classes usadas são do pacote SOAP (SAAJ):

```java
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfCxfMessageFormat_Then_returnSmithName() throws Exception {
        SOAPMessage soapMessage = createGetUserSOAPMessage(EXISTING_USER_ID);

        //...
        SOAPMessage response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", soapMessage, SOAPMessage.class);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSOAPMessage(long userId) 
            throws SOAPException, JAXBException {
        MessageFactory messageFactory = MessageFactory
                .newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        ObjectFactory objectFactory = new ObjectFactory();
        UserPayload userPayload = objectFactory.createUserPayload();
        userPayload.setId(userId);
        JAXBContext.newInstance(UserPayload.class).createMarshaller()
                .marshal(objectFactory.createGetUserRequest(userPayload),
                        envelope.getBody());
        // or handcraft: envelope.getBody().addBodyElement().addChildElement()...
        return soapMessage;
    }
}
```

Em vez de criar elementos manualmente como no exemplo SAAJ, desta vez, vamos usar a interface JAXB para converter o POJO em um corpo SOAP.

### Configuração do CXF no Camel

A opção de configuração da URI do Camel `cxfConfigurer` permite que você se conecte à configuração do CXF. Com ela, você pode definir opções de conexão,
proteger adicionalmente a comunicação (por exemplo, usando
*[mTLS](https://cxf.apache.org/docs/client-http-transport-including-ssl-support.html)*, enquanto *Basic Auth* pode ser
configurado via URI), ou definir interceptadores.

```java
package io.github.t3rmian.jmetersamples;

import org.apache.camel.component.cxf.jaxws.CxfConfigurer;
import org.apache.cxf.endpoint.Client;
import org.apache.cxf.endpoint.Server;
import org.apache.cxf.ext.logging.LoggingInInterceptor;
import org.apache.cxf.ext.logging.LoggingOutInterceptor;
import org.apache.cxf.ext.logging.event.PrettyLoggingFilter;
import org.apache.cxf.ext.logging.slf4j.Slf4jVerboseEventSender;
import org.apache.cxf.frontend.AbstractWSDLBasedEndpointFactory;
import org.apache.cxf.transport.http.HTTPConduit;
import org.apache.cxf.transports.http.configuration.HTTPClientPolicy;

public class CxfTimeoutConfigurer implements CxfConfigurer {

    @Override
    public void configure(AbstractWSDLBasedEndpointFactory factoryBean) {}

    @Override
    public void configureClient(Client client) {
        HTTPConduit httpConduit = (HTTPConduit) client.getConduit();
        httpConduit.setClient(getHttpClientPolicy());
        LoggingInInterceptor loggingInInterceptor = new LoggingInInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingInInterceptor);
        LoggingOutInterceptor loggingOutInterceptor = new LoggingOutInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingOutInterceptor);
    }

    static HTTPClientPolicy getHttpClientPolicy() {
        HTTPClientPolicy httpClientPolicy = new HTTPClientPolicy();
        httpClientPolicy.setConnectionTimeout(1000);
        httpClientPolicy.setConnectionRequestTimeout(1000);
        httpClientPolicy.setReceiveTimeout(1000);
        return httpClientPolicy;
    }

    @Override
    public void configureServer(Server server) {}
}
```

Na configuração acima, habilitei o log que é típico para configurações verbosas. Através da URI do Camel, você tem acesso à
opção `loggingFeatureEnabled=true`, que infelizmente não registra o conteúdo da mensagem. O log adicional se mostra
valioso ao implementar do zero. Confiar no método `log()` do Camel não mostra a mensagem final, apenas o
objeto antes (envio) / depois do mapeamento.

Uma opção de configuração alternativa é o arquivo de classpath [`cxf.xml`](https://cxf.apache.org/docs/configuration.html).
No entanto, esta opção requer dependências do Spring. A este respeito, você só precisa do `org.springframework:spring-context`.

## Camel Autônomo

As amostras acima carecem de algo em termos da solução final. Em sua simplicidade, a
dependência [`org.apache.camel:camel-main`](https://camel.apache.org/components/3.20.x/others/main.html) permite que todas as rotas
iniciem enquanto aguardam o término do programa. Além disso, oferece varredura automática de configuração. Abaixo está um pequeno
exemplo:

```java
package io.github.t3rmian.jmetersamples;

import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.component.cxf.common.message.CxfConstants;
import org.apache.camel.main.BaseMainSupport;
import org.apache.camel.main.Main;
import org.apache.camel.main.MainListenerSupport;

public class CamelSoapClient {
    public static void main(String[] args) throws Exception {
        Main main = new Main(CamelSoapClient.class);
        main.addMainListener(new MainListenerSupport() {
            @Override
            public void afterStart(BaseMainSupport main) {
                UserPayload userPayload = new ObjectFactory().createUserPayload();
                userPayload.setId(EXISTING_USER_ID);
                System.out.println("Requesting user " + userPayload.getId());
                try (ProducerTemplate producerTemplate = main
                        .getCamelContext().createProducerTemplate()) {
                    User user = producerTemplate.requestBody("direct:getUser",
                            userPayload, User.class);
                    System.out.println("Response contains " + user.getName());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
                System.out.println("Camel is running and waiting for SIGINT...");
            }
        });
        System.exit(main.run(args));
    }

    @SuppressWarnings("unused") // auto discovered by org.apache.camel.main.Main
    public static class MyRouteBuilder extends RouteBuilder {
        @Override
        public void configure() {
            from("direct:getUser")
                    .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
// An alternative to cxfConfigurer URI parameter:
// .setHeader(Client.REQUEST_CONTEXT, () -> new HashMap<String, Object>() {{
//      this.put(HTTPClientPolicy.class.getName(),
//          CxfTimeoutConfigurer.getHttpClientPolicy());
// }})
                    .to(getCxfUri(DataFormat.POJO) + "&loggingFeatureEnabled=true")
                    .process(exchange -> exchange.getIn().setBody(exchange.getIn().getBody()));
        }
    }
}
```

O Camel detecta automaticamente a classe `MyRouteBuilder` durante o processo de varredura e, após a inicialização, você pode usar o caminho sem registrá-lo explicitamente.

A princípio, tentei implementar a interface CamelConfiguration e adicionar a configuração usando
o método `new Main().configure().addConfiguration(CamelSoapClient.class)`. No entanto, foi ignorado
porque a classe continha um método main.
Mesmo quando usei o `new Main(CamelSoapClient.class)`, ainda falhou se minha classe implementasse a interface CamelConfiguration:
```java
public class CamelSoapClient {
    @Override
    public void configure(CamelContext camelContext) throws Exception {
        camelContext.addRoutes(new RouteBuilder() {
            // ...
        });
    }
}
```
O Camel detectou uma classe interna não estática e tentou inicializá-la para configuração.
Em seguida, lançou um erro bastante enigmático `java.lang.NoSuchMethodException: io.github.t3rmian.jmetersamples.CamelSoapClient$2.<init>()`.

Então, voltamos ao exemplo original que funciona. Aqui eu uso `MainListenerSupport`, que permite chamar
código adicional após o início do contexto - por exemplo, uma chamada de teste. Então, com o sinal SIGINT, você pode encerrar tal aplicação.

### Fat JAR

O passo final na preparação de uma aplicação autônoma é construir um artefato contendo todas as dependências, o chamado
fat JAR.
Para tal construção, você precisa do plugin `org.apache.camel:camel-maven-plugin`, que no objetivo `prepare-fatjar`,
prepara
as dependências do Camel para tal pacote. Por exemplo, ele cria um arquivo `UberTypeConverterLoader` combinando vários
arquivos e o armazena na pasta `META-INF` para garantir que os conversores sejam carregados corretamente.

No entanto, este plugin não gera o artefato resultante. Para criar um artefato, você precisa de outro plugin, por exemplo, `maven-assembly-plugin`.
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-assembly-plugin</artifactId>
    <configuration>
        <descriptorRefs>
            <descriptorRef>jar-with-dependencies</descriptorRef>
        </descriptorRefs>
        <archive>
            <manifest>
                <mainClass>io.github.t3rmian.jmetersamples.CamelSoapClient</mainClass>
            </manifest>
        </archive>
    </configuration>
    <executions>
        <execution>
            <id>make-assembly</id>
            <phase>package</phase>
            <goals>
                <goal>single</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

Agora, se você estiver usando dependências do CXF, elas precisam ser preparadas da mesma forma que as dependências do Camel. Por exemplo, entre outras coisas, você precisa de um
arquivo `bus-extensions.txt` anexado na pasta `META-INF`. O plugin `maven-shade-plugin` funciona muito bem para isso,
e uma configuração adequada para o CXF pode ser
encontrada na [documentação](https://cxf.apache.org/docs/bundling-cxf-into-single-jar-with-maven-shade-plugin.html).
Tudo o que você precisa fazer é fornecer sua própria classe inicial no lugar do `mainClass`.

## Resumo

Agora que você sabe como construir consultas SOAP, ler respostas e configurar interceptores, cabe a você implementar a
lógica de negócios. Ao adicionar dependências, lembre-se da evolução da plataforma Java. Em versões subsequentes,
alguns pacotes foram excluídos do JDK para artefatos separados. Além disso, as versões e plugins mais recentes
migram da nomenclatura JEE `javax` para nomes de pacote Jakarta (Camel 4.x, CXF 4.x, JAXB 4.x). Misturar ambos os pacotes geralmente leva
a problemas, especialmente quando não verificamos o código gerado.

Por exemplo, se você usar anotações Jakarta em um tempo de execução JEE, não há garantia de que elas serão analisadas com precisão.
Elementos de consulta aninhados podem acabar sem seus namespaces, mesmo com a configuração do pacote `elementFormDefault = XmlNsForm.QUALIFIED`.
Se você suspeitar disso, imprima o esquema gerado a partir de classes anotadas com JAXB para verificar este problema:

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.JAXBException;
import javax.xml.bind.SchemaOutputResolver;
import javax.xml.transform.Result;
import javax.xml.transform.stream.StreamResult;

import java.io.IOException;
import java.io.PrintWriter;

public class CamelSoapClientIT {
    static {
        printSchema();
    }

    private static void printSchema() throws JAXBException, IOException {
        JAXBContext jaxbContext = JAXBContext.newInstance(UserPayload.class);
        jaxbContext.generateSchema(new SchemaOutputResolver() {
            @Override
            public Result createOutput(String namespaceUri, String suggestedFileName) {
                StreamResult streamResult = new StreamResult(new PrintWriter(System.out) {
                    @Override
                    public void close() {
                    }
                });
                streamResult.setSystemId(suggestedFileName);
                return streamResult;
            }
        });
    }
}
```

