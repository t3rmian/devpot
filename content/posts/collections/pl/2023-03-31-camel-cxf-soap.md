---
title: SAAJ, CXF, Camel i klient SOAP na przykładach
url: saaj-cxf-camel-klient-soap
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

W przypadku dużych systemów legacy gdzie architektura monolitowa często wiąże się z wolniejszym dostarczaniem
zmian, przydatne okazuje się narzędzie do implementacji tymczasowych rozwiązań integracyjnych.
Camel obsługuje wiele protokołów i formatów danych, co oznacza, że można go łatwo zintegrować z istniejącymi
systemami, a dodatkowo tryb standalone nie wymaga ingerencji w dotychczasową infrastrukturę.
Dzięki temu Camel jest idealny do budowania tymczasowych rozwiązań, dla których świetnie sprawdza się 
implementacja gotowych wzorców integracyjnych (*polling*, *splitter*, *throttle*, *circuit breaker*, i wiele innych).

SOAP w kontekście starszych systemów jest jednym z popularniejszych (w sensie częstotliwości występowania)
protokołów wymiany danych. Kombinacja z XMLem sprawia, że implementacja komunikacji z takim web serwisem 
nie przebiega tak szybko, jak przy typowej architekturze RESTowej opartej na protokole HTTP. Tym bardziej,
gdy potrzebujemy szybkiego rozwiązania tymczasowego przygotowywanego od zera.

## SAAJ

O ile Java oferuje zestaw interfejsów pod nazwą SAAJ (*SOAP with Attachments API for Java*) na potrzeby komunikacji
SOAP, to jest to dosyć niskopoziomowe API pod nazwą pakietu `javax.xml.soap`.
W przypadku złożonych struktur zapytań i odpowiedzi nie jest zbyt poręczne do implementacji.
Nie ma tutaj również bezpośredniej funkcjonalności walidacji dokumentów XML/XSD.

Popatrzmy jednak na przykłady.
Do dyspozycji mamy serwer z web serwisem SOAPowym z repozytorium https://github.com/t3rmian/jmeter-samples.
Serwis nasłuchuje i odpowiada na przykładowe zapytania:

<img src="/img/hq/soap-request-response.png" title='Przykładowe zapytanie i odpowiedź SOAP' alt='<!--getUser_4_smith_request.xml Request-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--Response-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

Klasy potrzebne do implementacji komunikacji z poziomu klienta przy pomocy SAAJ i samoopisujący się kod może wyglądać następująco:

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

Przy wykorzystaniu tego API nie należy zapominać o używaniu nazw przestrzeni zarówno do budowania, jak i wyszukiwania elementów.
Ich brak będzie powodował odrzucenie zapytania, bądź nieznalezienie elementu przy odczytywaniu (zgubne przy elementach opcjonalnych).

> W procesie ciągłej ewolucji platformy Java, SAAJ zostało [usunięte](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4) z Javy SE 11 i nie jest już dostarczane z JDK. Pakiet ten wyłączony został do zależności `javax.xml.soap:javax.xml.soap-api`, którą możesz odnaleźć w centralnym repozytorium mavenowym.

## JAX-WS i Apache CXF

CXF (akronim od nazw produktów Celtix + XFire z 2006) jako framework do budowania web serwisów i klientów umożliwia dużo szybszą implementację komunikacji, szczególnie
gdy do czynienia mamy z zaawansowanymi strukturami i rozszerzeniami na przykład WSS. W ramach standardowych interfejsów (aż do Javy 11),
pełni też rolę implementacji JAX-WS (*Java API for XML Web Services*).

Pod względem narzędzi Apache CXF oferuje wtyczkę mavenowa `org.apache.cxf:cxf-codegen` do generowania klas Javy reprezentujących
web serwis z plików WSDL/XSD.

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

> Ta wtyczka zazwyczaj nie jest automatycznie wywoływana przez IDE (np. IntelliJ). Możesz skorzystać bezpośrednio z mavena lub podpiąć ten krok do konfiguracji uruchomieniowej.

Do implementacji klienta potrzebować będziemy artefaktów z grupy `org.apache.cxf`:
- `cxf-core` – przetwarzanie, mapowanie, obsługa protokołów;
- `cxf-rt-frontend-jaxws` – klasy klienckie;
- `cxf-rt-databinding-jaxb` – mapowanie na XML;
- `cxf-rt-transports-http` – komunikacja HTTP;
- `cxf-rt-transports-soap` – wsparcie SOAP;
- `cxf-rt-features-logging` – rozszerzenie dla logowania komunikacji.

> Jeśli na swoim środowisku borykasz się z błędem pokroju `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2.runtime.reflect.opt.Injector.defineClass" is null`, rzuć okiem na rozwiązania z https://github.com/eclipse-ee4j/jaxb-ri/issues/1197.  
> W moim repozytorium z przykładami problem obszedłem, dodając oprócz tranzytywnej zależności JAXB `jaxb-runtime` dodatkowe klasy `com.sun.xml.bind:jaxb-xjc` związane z generowaniem kodu Javy z plików XML. O ile w przykładach klasy są już wygenerowane, to podczas uruchomienia na innej wersji Javy, implementacja JAXB próbowała zoptymalizować do nich dostęp, powodując błąd wewnętrzny. 

Tym razem kod jest znacznie prostszy. Korzystamy z DTO wygenerowanych przez plugin, a dodatkowo odwołując się do implementacji CXF mamy sposobność konfiguracji klienta (*timeout*, *logging*, SSL):

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

## Camel i SOAP

Dopełnieniem komunikacji z SOAPowymi web serwisami jest Camel i jego wzorce integracyjne.
Dzięki nim niewielkim nakładem pobierzemy dane z bazy czy też skomunikujemy ze sobą dwa różne endpointy.
Od wersji 3.18, zależności potrzebne do integracji z CXF zostały [rozbite](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf) (CAMEL-9627) na kilka mniejszych pakietów.
Wersje niższe w tym 2.x (wspierająca starszą Javę 8) wymagały jednego artefaktu `org.apache.camel:camel-cxf`.
Do naszych przykładów zadziała dowolny artefakt z `soap` (3.18+) w swojej nazwie.

Koncepcja ścieżek URI dla przepływu wiadomości pomiędzy endpointami pozwala na bardzo wiele możliwości konfiguracyjnych.
Na tapet weźmy możliwe formaty danych, w zależności od wyboru którego, będziemy musieli skonstruować wiadomość.
Mamy do wyboru 4 formaty z typowym zastosowaniem:
- RAW/MESSAGE – wysyłanie i odbieranie wiadomości w postaci surowej np. `String`;
- POJO - POJO tak jak w przykładzie z CXF;
- PAYLOAD - dokument XML `org.w3c.dom` reprezentujący *body* załadowany do camelowego `CxfPayload` i oddzielnie nagłówki; 
- CXF_MESSAGE – postać koperty SOAP z pakietu `javax.xml.soap`.

Każdego formatu dotyczą różne reguły, np. pod względem aplikacji interceptorów CXF. O nich poczytasz w [dokumentacji](https://camel.apache.org/components/3.20.x/cxf-component.html).
Do rozpoczęcia zabawy ważne jest zobaczenie przykładów.

> Jeszcze innym sposobem jest opakowanie komunikacji bezpośredniej przez CXF w *beanie* i podpięcie go do ścieżki camelowej.

### RAW/MESSAGE

Format `RAW` sprawdza się do wysyłania wiadomości w postaci tekstu ładowanego na przykład z pliku.
W odpowiedzi również otrzymamy tekst, co z jednej strony pozwala na szybką implementację, z drugiej jednak weryfikacja elementów wiadomości jest utrudniona.

Zanim jednak przystąpimy do komunikacji, musimy stworzyć URI, za pomocą którego Camel wyśle dane w odpowiednie miejsce.

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

Używamy tu zarejestrowanego komponentu `cxf`. Wyrażenie `{{wsEndpointAddress}}` pozwala na załadowanie zmiennej środowiskowej bądź
będącej parametrem Javy np. `http://localhost:8080/ws/users`. Pod ścieżką `wsdlURL` znajduje się plik z *classpath* opisujący usługę SOAPową.
Kolejno poprzez:
- `serviceClass` (klasa adnotowana `@WebServiceClient`),
- `serviceName` (nazwa przestrzeni + nazwa z adnotacji `@WebServiceClient`),
- `portName` (metoda z adnotacją `@WebEndpoint`),

połączymy elementy wygenerowane przez `cxf-codegen-plugin`.
O `cxfConfigurer` opowiem natomiast w jednej z kolejnych sekcji.

### POJO

Format `POJO` w swej prostocie pozwala na wykorzystanie klas wygenerowanych przez wtyczkę `cxf-codegen-plugin`:

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

Przygotowanie wiadomości w formacie `PAYLOAD` jest nieco trudniejsze. Możemy to zrobić, budując dokument, który następnie ładujemy
do `CxfPayload`. W podobny sposób możemy przekazać nagłówki jako pierwszy parametr. Odpowiedź odczytujemy w typowo XMLowym stylu,
odpytując o elementy o danej nazwie z przestrzeni nazw.

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

Format `CXF_MESSAGE` wygląda dosyć podobnie do `PAYLOAD`, tym razem jednak użyte klasy są typowo SOAPowe (SAAJ):

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

Zamiast ręcznie tworzyć elementy jak w przykładzie dla SAAJ, tym razem używamy interfejsu JAXB do przekonwertowania POJO
do *body* SOAPowego.

### Konfiguracja CXF w Camelu

Camelowa opcja konfiguracyjna URI `cxfConfigurer` pozwala na wpięcie się do konfiguracji CXF. Za jej pomocą możemy ustawić opcje połączenia,
dodatkowo zabezpieczyć komunikację (np. *[mTLS](https://cxf.apache.org/docs/client-http-transport-including-ssl-support.html)*; natomiast *Basic Auth* można skonfigurować poprzez URI) czy ustawić interceptory.

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

W powyższej konfiguracji ustawiłem logowanie typowe dla ustawień *verbose*. Poprzez URI mamy dostęp do opcji `loggingFeatureEnabled=true`,
która jednak nie loguje zawartości wiadomości. Dodatkowe logowanie okazuje się przydatna przy implementacji od zera. Poleganie na camelowej metodzie `log()`
nie ukazuje finalnej wiadomości, a jedynie obiekt przed (wysłaniem) / po mapowaniu.

Alternatywną opcją konfiguracji jest plik [`cxf.xml`](https://cxf.apache.org/docs/configuration.html) na ścieżce *classpath*.
Ta opcja wymaga jednak zależności springowych. Pod tym względem potrzebny jest jedynie `org.springframework:spring-context`.

## Camel *standalone*

Do pełnego rozwiązania może nam brakować modułu spinającego naszą implementację. W swej prostocie zależność [`org.apache.camel:camel-main`](https://camel.apache.org/components/3.20.x/others/main.html)
pozwala na wystartowanie wszystkich ścieżek w oczekiwaniu na przerwanie programu. Oprócz tego oferuje automatyczne skanowanie ścieżek.
Poniżej krótki przykład:

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

Klasa `MyRouteBuilder` jest automatycznie wykrywana w procesie skanowania i po wystartowaniu
możemy użyć ścieżki bez wyraźnej jej rejestracji. 

Warto zanotować, że początkowo próbowałem zaimplementować interfejs `CamelConfiguration`
i dodać konfigurację za pomocą metody `new Main().configure().addConfiguration(CamelSoapClient.class)`, jednak kofiguracja
w ten sposób była ignorowana ze względu na obecność metody `main` w klasie.
Próba z `new Main(CamelSoapClient.class)`, gdy klasa implementuje `CamelConfiguration`, również nie działa:
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
Camel wykrywa niestatyczną klasę wewnętrzną i próbuje ją zainicjalizować na potrzeby konfiguracji.
Otrzymujemy dosyć enigmatyczny błąd: `java.lang.NoSuchMethodException: io.github.t3rmian.jmetersamples.CamelSoapClient$2.<init>()`.

Wracamy więc do pierwotnego przykładu, który działa. Korzystamy w nim dodatkowo z `MainListenerSupport`, który pozwala wywołać
dodatkowy kod po wystartowaniu kontekstu – np. do testowego wywołania ścieżki. Tak uruchomiona aplikacja będzie
obsługiwać ścieżki i czekać na zamknięcie np. sygnałem SIGINT.

### *Fat JAR*

Ostatecznym krokiem przygotowania aplikacji *standalone* jest zbudowanie artefaktu zawierającego wszystkie zależności, tzw. *fat JAR*.
Przy takim budowaniu potrzebujemy wtyczki `org.apache.camel:camel-maven-plugin`, która w kroku `prepare-fatjar` przygotowuje
zależności camelowe do takiej paczki. Przykładowo generuje on złączony plik `UberTypeConverterLoader` w folderze `META-INF` do
poprawnego załadowania konwerterów.

Plugin ten nie generuje jednak wynikowego artefaktu. Do utworzenia artefaktu potrzebujemy innego wtyczki np. `maven-assembly-plugin`.
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

Jeśli jednak korzystamy z zależności CXF,
to również trzeba je przygotować na tej samej zasadzie co zależności camelowe (np. potrzebujemy złączonego pliku `bus-extensions.txt` w folderze `META-INF`).
Świetnie sprawdza się do tego plugin `maven-shade-plugin`, którego konfigurację pod CXF znajdziesz [w dokumentacji](https://cxf.apache.org/docs/bundling-cxf-into-single-jar-with-maven-shade-plugin.html).
Wystarczy, że w miejscu `mainClass` podasz namiary na własną klasę startową.

## Podsumowanie

Wiedząc już, w jaki sposób można budować zapytania SOAPowe, odczytywać odpowiedzi i konfigurować interceptory w Twojej gestii
pozostaje implementacja logiki biznesowej. Przy dodawaniu zależności pamiętaj o ewolucji platformy Java, wraz z kolejnymi wersjami część
pakietów została wyłączona z JDK do oddzielnych artefaktów. Dodatkowo kolejne ich wersje i wtyczki przechodzą z nazewnictwa JEE `javax`
na nazwy pakietów Jakarta (Camel 4.x, CXF 4.x, JAXB 4.x). Mieszanie obu pakietów prowadzi często do problemów, szczególnie gdy nie weryfikujemy generowanego kodu.

Przykładowo, gdy w środowisku dostarczającym pakiety JEE zastosujesz adnotacje z Jakarty, niekoniecznie zostaną one poprawnie przetworzone.
Przy użyciu `elementFormDefault = XmlNsForm.QUALIFIED` elementy zagnieżdżone zapytania mogą zostać pozbawione przestrzeni nazw.
W celu zweryfikowania tego problemu możesz sprawdzić schemat wygenerowany w oparciu o klasy z adnotacjami JAXB:

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
