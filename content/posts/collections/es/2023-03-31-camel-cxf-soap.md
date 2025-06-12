---
title: SAAJ, CXF, Camel y ejemplos de cliente SOAP
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

Cuando trabajas con grandes sistemas legacy, normalmente de arquitectura monolítica y con entregas lentas,
es útil tener una herramienta confiable para implementar soluciones de integración temporales.
El soporte de Camel para múltiples protocolos y formatos de datos permite integrar fácilmente sistemas diversos.
Además, el modo standalone no requiere interferir con la infraestructura existente.
Esto hace que Camel sea ideal para construir soluciones temporales, aportando patrones de integración como polling,
splitter, throttle, circuit breaker y muchos más.

SOAP, en el contexto de sistemas antiguos, es uno de los protocolos de intercambio de datos más populares.
Combinado con XML, la implementación de la comunicación con un web service suele ser menos ágil que con una arquitectura REST típica basada en HTTP. Más aún si necesitas una solución temporal rápida desde cero.

## SAAJ

Java ofrece un conjunto de interfaces llamado SAAJ (*SOAP with Attachments API for Java*) para comunicación SOAP, pero es una API de bajo nivel bajo el paquete `javax.xml.soap`.
No es muy práctica para estructuras complejas de request/response y tampoco valida documentos XML/XSD.

Veamos algunos ejemplos.
Tenemos un servidor con un web service SOAP de mi repositorio de ejemplos https://github.com/t3rmian/jmeter-samples.
El servicio escucha y responde a peticiones de ejemplo:

<img src="/img/hq/soap-request-response.png" title='Ejemplo de consulta y respuesta SOAP' alt='<!--getUser_4_smith_request.xml Request-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--Response-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

Las clases necesarias para implementar la comunicación desde el cliente usando SAAJ y un código autoexplicativo pueden verse así:

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
Para usar esta API correctamente, recuerda utilizar los namespaces al crear elementos y al buscar elementos en la respuesta.
Omitirlos puede hacer que la petición sea rechazada o que no encuentres el elemento al leer, lo que puede ser desastroso para partes opcionales.

> En la evolución de Java, SAAJ ha sido deprecado y luego [eliminado](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4) de Java SE 11 y ya no viene con el JDK. Este paquete se ha extraído a un artefacto separado `javax.xml.soap:javax.xml.soap-api`, disponible en Maven Central.

## JAX-WS y Apache CXF

CXF (acrónimo de la fusión de Celtix y XFire en 2006) como framework para construir servicios web y clientes permite una implementación mucho más rápida,
sobre todo con estructuras avanzadas y extensiones como WSS. En el ámbito de interfaces estándar (hasta Java 11),
también sirve como proveedor para JAX-WS (Java API for XML Web Services).

En cuanto a herramientas, Apache CXF ofrece el plugin Maven `org.apache.cxf:cxf-codegen` para generar clases Java a partir de archivos WSDL/XSD.

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

> Un IDE (por ejemplo, IntelliJ) normalmente no invoca este plugin automáticamente. Puedes usar Maven directamente o incluir este paso manualmente en tu configuración de ejecución.

Para implementar el cliente, necesitarás artefactos del grupo `org.apache.cxf`:
- `cxf-core` – clases para procesamiento, mapeo y manejo de protocolos;
- `cxf-rt-frontend-jaxws` – clases cliente;
- `cxf-rt-databinding-jaxb` – mapeo XML;
- `cxf-rt-transports-http` – comunicación HTTP;
- `cxf-rt-transports-soap` – soporte SOAP;
- `cxf-rt-features-logging` – extensión de logging de mensajes.

> Si ves un error como `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2 .runtime.reflect.opt.Injector.defineClass" is null`, revisa las soluciones en https://github.com/eclipse-ee4j/jaxb-ri/issues/1197.  
> Mi workaround fue añadir el artefacto `com.sun.xml.bind:jaxb-xjc` relacionado con la generación de código Java desde XML además de la dependencia transitiva `jaxb-runtime`. Aunque las clases ya están generadas en los ejemplos, ejecutarlas en otra versión de Java puede causar un error interno porque JAXB intenta optimizar el acceso usando clases que faltan.

Esta vez el código es mucho más simple. Usamos los DTOs generados por el plugin. Además, al referenciar la implementación de CXF, puedes configurar el cliente (timeout, logging, SSL):

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

## Camel y SOAP

Camel complementa la comunicación con servicios SOAP mediante sus patrones de integración.
Gracias a ellos, puedes hacer polling de datos de una base o implementar un puente entre dos endpoints.
Desde la versión 3.18, las dependencias para integración con CXF se han [dividido](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf) (CAMEL-9627) en varios paquetes pequeños.
En versiones anteriores, también la 2.x (que soporta Java 8), solo se requería un artefacto: `org.apache.camel:camel-cxf`.
Cualquier artefacto con `soap` (3.18+) en el nombre funcionará para nuestros ejemplos.

El concepto de rutas URI para el flujo de mensajes entre endpoints permite muchas opciones de configuración.
Veamos los formatos de datos que definen cómo construir el mensaje.
Puedes elegir entre cuatro formatos:
- RAW/MESSAGE – permite enviar y recibir mensajes en crudo, por ejemplo, `String`;
- POJO – POJO como en el ejemplo de CXF;
- PAYLOAD – documentos XML `org.w3c.dom` que representan el body SOAP y puedes cargar en un `CxfPayload` de camel;
- CXF_MESSAGE – envelope SOAP del paquete `javax.xml.soap`.

Cada formato tiene sus propias reglas, como la aplicación de interceptores CXF. Puedes leer más en [la documentación](https://camel.apache.org/components/3.20.x/cxf-component.html).
Pero para empezar, es clave ver ejemplos de implementación de clientes.

> Otra opción es envolver la comunicación CXF directa en un bean y enlazarlo a una ruta camel.

### RAW/MESSAGE

El formato `RAW` es útil para enviar mensajes como texto, cargados por ejemplo desde un archivo.
Recibirás un texto como respuesta, lo que es rápido de implementar pero puede no ser ideal para otros usos.

Antes de enviar los datos, necesitas crear una URI con la que Camel enviará los datos al destino correcto.

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

La URI empieza con el componente `cxf` auto-registrado con la dependencia incluida. La expresión `{{wsEndpointAddress}}` permite cargar la variable de entorno o
una propiedad Java, por ejemplo, `http://localhost:8080/ws/users`. El `cxfConfigurer` se describe más adelante. Por ahora, solo nota que es una configuración para un modo CXF genérico,
útil para enviar estructuras arbitrarias no ligadas a un esquema específico.

### POJO

El formato `POJO`, en su simpleza, permite usar las clases generadas por el plugin `cxf-codegen-plugin`.
Pero necesitas ajustar la configuración de la URI para que el binding sea correcto.

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

