---
title: SAAJ, CXF, Camel and SOAP client samples
url: saaj-cxf-camel-soap-client
id: 107
category:
  - java: Java 
tags:
  - camel
  - cxf
  - web services
  - soap
  - jaxb
  - xml
  - jaxws
  - jakarta
author: Damian Terlecki
date: 2023-03-31T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

When dealing with large legacy systems that typically have monolithic architecture leading to slower delivery speed,
it's helpful to have a trusted tool for implementing temporary integration solutions.
Camel's support for multiple protocols and data formats enables easy integration with diverse systems.
In addition, the standalone mode does not require interference with the existing infrastructure.
It makes Camel ideal for building temporary solutions, for which it brings various integration patterns like polling,
splitter, throttle, circuit breaker, and many others.

SOAP in the context of older systems is one of the more popular (in terms of frequency of occurrence) data exchange
protocols. In combination with XML, the implementation of communication with such a web service is often not as fast as
with a typical REST architecture based on the HTTP protocol. Even more so when you need a quick temporary solution
prepared from scratch.

## SAAJ

While Java offers a set of interfaces called SAAJ (*SOAP with Attachments API for Java*) for SOAP communication, it is a
low-level API under the `javax.xml.soap` package. To be clear, it's not very
handy for complex request and response structures. It also doesn't have a validation feature for XML/XSD documents.

But let's look at some examples.
We have a server with a SOAP web service from my samples repository https://github.com/t3rmian/jmeter-samples.
The service listens to and responds to sample requests:

<img src="/img/hq/soap-request-response.png" title='Sample SOAP query and response' alt='<!--getUser_4_smith_request.xml Request-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--Response-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

The classes needed to implement communication from the client level using SAAJ and self-descriptive code might look like this:

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
To use this API effectively, remember to utilize namespaces during element creation and when searching for elements in the response.
Omitting them will either result in the rejection of the request or in the inability to find the element when reading, which can be disastrous for optional parts.

> In the ongoing evolution of the Java platform, SAAJ has been deprecated and then [removed](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4) from Java SE 11 and no longer ships with the JDK. This package has been extracted into a separate artifact `javax.xml.soap:javax.xml.soap-api`, which you can find in the Maven Central Repository.

## JAX-WS and Apache CXF

CXF (an acronym created from the merge of Celtix and XFire products from 2006) as a framework for building web services and clients enables much faster
implementation of communication, especially
when dealing with advanced structures and extensions, for example, WSS. In the scope of standard interfaces (up to Java 11),
it also serves as a provider for JAX-WS (Java API for XML Web Services).

In terms of tooling, Apache CXF offers a Maven plugin `org.apache.cxf:cxf-codegen` for generating Java classes representing a web service from WSDL/XSD files.

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

> An IDE (e.g., IntelliJ) typically does not automatically invoke this plugin. You can use Maven directly or manually include this step in your runtime configuration.

To implement the client, you will need artifacts from the `org.apache.cxf` group:
- `cxf-core` – classes responsible for processing, mapping, and protocol handling;
- `cxf-rt-frontend-jaxws` – client classes;
- `cxf-rt-databinding-jaxb` – XML mapping;
- `cxf-rt-transports-http` – HTTP communication;
- `cxf-rt-transports-soap` – SOAP support;
- `cxf-rt-features-logging` – message logging extension.

> If you are facing an error like `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2 .runtime.reflect.opt.Injector.defineClass" is null`, take a look at the solutions from https://github.com/eclipse-ee4j/jaxb-ri/issues/1197.  
> My sample workaround was to add `com.sun.xml.bind:jaxb-xjc` artifact related to generating Java code from XML files in addition to the transitive JAXB `jaxb-runtime` dependency. Although the classes are already generated in the provided examples, running them on a different Java version can cause an internal error due to the JAXB implementation attempting to optimize access using missing classes.

This time the code is much simpler. We use the DTOs generated by the plugin. Additionally, by referring to the CXF
implementation, you have the opportunity to configure the client (timeout, logging, SSL):

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

## Camel and SOAP

Camel complements the communication with SOAP web services through its integration patterns.
Thanks to them, you can pool the data from the database or implement a bridge between two different endpoints.
As of version 3.18, the dependencies required for integration with CXF have been [split](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf) (CAMEL-9627) into several smaller packages.
Earlier versions, also 2.x (which supports Java 8), only required a single artifact, i.e., `org.apache.camel:camel-cxf`.
Any artifact with `soap` (3.18+) in its name will work for our examples.

The concept of URI paths for the flow of messages between endpoints allows for many configuration options.
Let's consider the data formats that define how to construct the message.
You can choose from one of the four formats.
- RAW/MESSAGE - allows for sending and receiving messages in raw form, e.g., `String`;
- POJO - POJO as in the CXF example;
- PAYLOAD - `org.w3c.dom` XML documents representing SOAP body that you can load into camel `CxfPayload`;
- CXF_MESSAGE – SOAP envelope from the `javax.xml.soap` package.

Each data format has its own set of rules, such as the application of CXF interceptors. You can read about them in [the documentation](https://camel.apache.org/components/3.20.x/cxf-component.html).
However, in order to start, it is crucial to examine some examples of client implementations.

> Yet another way is to wrap CXF direct communication in a bean and bind it to a camel track.

### RAW/MESSAGE

The `RAW` format works well for sending messages in the form of text, loaded, for example, from a file.
You will receive a text in response which, while quick to implement, may not be suitable for accessing it for other purposes.

However, before you send the data, you need to create a URI using which Camel will send the data to the right place.

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
        return "cxf://{{wsEndpointAddress}}"
                + "?wsdlURL=users.wsdl"
                + "&serviceClass=https.github_com.t3rmian.jmeter_samples.Users"
                + "&serviceName={https://github.com/t3rmian/jmeter-samples}UsersService"
                + "&portName={https://github.com/t3rmian/jmeter-samples}UsersSoap11"
                + "&dataFormat=" + dataFormat;
    }
}
```

The URI starts with the `cxf` component auto-registered with the included dependency. The expression `{{wsEndpointAddress}}` allows you to load the environment variable or
a Java Property, e.g., `http://localhost:8080/ws/users`. Under the path `wsdlURL`, there is a classpath file describing the SOAP service.
Subsequently through:
- `serviceClass` (the `@WebServiceClient` annotated class),
- `serviceName` (the namespace and name from the `@WebServiceClient`),
- `portName` (the method annotated `@WebEndpoint`),

you will match the elements generated by `cxf-codegen-plugin`.
The `cxfConfigurer` will be described later.

### POJO

The `POJO` format, in its simplicity, allows the use of classes generated by the `cxf-codegen-plugin` plugin:

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.User;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPOJOFormat_Then_returnSmithName() throws Exception {
        UserPayload userPayload = new ObjectFactory().createUserPayload();
        userPayload.setId(EXISTING_USER_ID);

        //...
        User user = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", userPayload, User.class);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }
}
```

### PAYLOAD

Preparing a message in the `PAYLOAD` format is more challenging. Start by building an XML document, and load it into a `CxfPayload`.
Likewise, you can pass the headers as the first argument to the constructor.
Read the response in a typical XML way, and look for elements in the response by a given name and a namespace.

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

The `CXF_MESSAGE` format looks quite similar to `PAYLOAD`, but this time the classes used are from the SOAP package (SAAJ):

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

Instead of manually creating elements as in the SAAJ example, this time, let's use the JAXB interface to convert the POJO to a SOAP body.

### CXF configuration in Camel

The Camel `cxfConfigurer` URI configuration option allows you to plug into the CXF configuration. With it, you can set connection
options, additionally secure communication (e.g., using
*[mTLS](https://cxf.apache.org/docs/client-http-transport-including-ssl-support.html)*, whereas *Basic Auth* can be
configured via URI), or set interceptors.

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

@SuppressWarnings("unused") // used in tests
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

In the above configuration, I have enabled logging that is typical for verbose settings. Through the Camel URI, you have access to the
`loggingFeatureEnabled=true` option, which unfortunately does not log the content of the message. Additional logging proves
valuable when implementing from scratch. Relying on Camel's `log()` method does not show the final message, only the
object before (sending) / after mapping.

An alternative configuration option is the [`cxf.xml`](https://cxf.apache.org/docs/configuration.html) classpath file.
However, this option requires Spring dependencies. In this respect, you only need the `org.springframework:spring-context`.

## Standalone Camel

The above samples lack something in terms of the final solution. In its simplicity, the
dependency [`org.apache.camel:camel-main`](https://camel.apache.org/components/3.20.x/others/main.html) allows all routes
to start while waiting for the program termination. In addition, it offers automatic configuration scanning. Below is a short
example:

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

Camel auto-detects `MyRouteBuilder` class during the scanning process, and after startup, you can use the path without explicitly registering it.

At first, I attempted to implement the CamelConfiguration interface and add the configuration using
the `new Main().configure().addConfiguration(CamelSoapClient.class)` method. However, it was ignored
because the class contained a main method.
Even when I used the `new Main(CamelSoapClient.class)`, it still failed if my class implemented the CamelConfiguration interface:
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
Camel detected a non-static inner class and tried to initialize it for configuration.
Then it threw a rather enigmatic `java.lang.NoSuchMethodException: io.github.t3rmian.jmetersamples.CamelSoapClient$2.<init>()` error.

So we're back to the original example that works. Here I use `MainListenerSupport`, which allows you to call
additional code after the startup of the context - e.g., a test call. Then with the SIGINT signal, you can terminate such an application.

### Fat JAR

The final step in preparing a standalone application is to build an artifact containing all dependencies, the so-called
fat JAR.
For such a build, you need the `org.apache.camel:camel-maven-plugin` plugin, which in the `prepare-fatjar` goal,
prepares
Camel dependencies for such a package. For instance, it creates an `UberTypeConverterLoader` file by combining multiple
files and storing it in the `META-INF` folder to ensure the converters are loaded correctly.

However, this plugin does not generate the resulting artifact. To create an artifact, you need another plugin, e.g., `maven-assembly-plugin`.
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

Now, if you're using CXF dependencies, they need to be prepared in the same way as Camel dependencies. E.g., among other things, you need an
appended `bus-extensions.txt` file in the `META-INF` folder. The `maven-shade-plugin` plugin works great for this, 
and a proper configuration for CXF can be
found in [the documentation](https://cxf.apache.org/docs/bundling-cxf-into-single-jar-with-maven-shade-plugin.html).
All you have to do is provide your own starting class in the place of the `mainClass`.

## Summary

Now that you know how to build SOAP queries, read responses, and configure interceptors, it's up to you to implement the
business logic. When adding dependencies, remember the evolution of the Java platform. In subsequent versions,
some packages have been excluded from the JDK to separate artifacts. In addition, the newest versions and plugins
move from the JEE `javax` naming to Jakarta package names (Camel 4.x, CXF 4.x, JAXB 4.x). Mixing both packages often leads
to problems, especially when we do not verify the generated code.

For example, if you use Jakarta annotations in a JEE runtime, there's no guarantee that they will be parsed accurately.
Nested query elements can end up stripped of their namespaces even with the `elementFormDefault = XmlNsForm.QUALIFIED` package configuration.
If you suspect this, print the schema generated from JAXB annotated classes to verify this issue:

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
