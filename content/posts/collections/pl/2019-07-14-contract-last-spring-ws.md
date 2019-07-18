---
title: Spring Web Services — od dołu do góry
url: contract-last-spring-ws
id: 8
tags:
  - spring
  - soap
  - web services
author: Damian Terlecki
date: 2019-07-21T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

Przeglądając internet (bądź zaglądając w dokumentację) dosyć szybko dowiedzieć się można, że moduł Spring-WS zaprojektowany został z myślą o tworzeniu web serwisów według z góry przyjętej specyfikacji. Dla przypomnienia, podczas tworzenia web serwisów możemy wybrać jedną z dwóch ścieżek.
Pierwsza z nich zakłada właśnie, że na początku tworzymy specyfikację (od góry do dołu), na podstawie której generowany jest szkielet serwisu. Druga opcja to implementacja od dołu do góry, czyli stworzenie klas i implementacja serwisu, z których wygenerowana zostanie specyfikacja WSDL.

Ogólnie rzecz biorąc, podejście "od góry do dołu" zalecane jest ze względu na takie cechy jak łatwiejsze utrzymanie, wersjonowanie, możliwość ponownego użycia oraz luźnie powiązanie (ang. loose coupling). Podejście to wymaga jednak pewnej znajomości specyfikacji SOAP w celu stworzenia poprawnego dokumentu WSDL. Czasami jednak preferowane może być podejście oddolne właśnie z tego powodu. W takim przypadku dogłębna znajomość SOAP-a nie jest wymagana i wytworzenie takiego serwisu jest (zazwyczaj) mniej czasochłonne. Jednak, jak można się spodziewać, styl ten nie ma zalet podejścia kontraktowego (od góry do dołu).

JAX-WS to całkiem dobry wybór dla obu stylów implementacji serwisów internetowych. Jak w tym przypadku miewa się Spring? Czy to prawda, że wspiera jedynie podejście odgórne? Ciekaw odpowiedzi na to pytanie postanowiłem sprawdzić podejście oddolne w praktyce (link do projektu na górze strony). Była to dosyć ciekawa lekcja, a wniosek, jaki z niej wyciągnąłem to to, że taka opcja jest również możliwa do zrealizowania. Warto jednak zaznaczyć, że Spring-WS wymusza nieco stosowanie pewnych praktyk. Ich obejście może skutkować późniejszymi niedogodnościami podczas fazy utrzymania projektu. Niemniej jednak zobaczmy, co przynosi nam ten moduł i jak możemy go wykorzystać przy implementacji web serwisów od dołu do góry.

### Konfiguracja POM

Na początku potrzebować będziemy kilku zależności. Polecam zacząć od `spring-boot-starter-parent` i ustawić ją jako konfigurację nadrzędną.
Przy okazji, najprawdopodobniej przydają ci się również moduły `spring-boot-starter-data-jpa` oraz `spring-boot-starter-web`. Cała konfiguracja (a właściwie szkielet projektu) może zostać wygenerowana za pomocą aplikacji internetowej **Spring Initializr**. Na sam koniec musimy koniecznie dodać wsparcie dla web serwisów wraz z generatorem *wsdl4j*, który zostanie wykorzystany do stworzenia specyfikacji.


```xml
&lt;dependency&gt;
	&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
	&lt;artifactId&gt;spring-boot-starter-web-services&lt;/artifactId&gt;
&lt;/dependency&gt;
&lt;dependency&gt;
	&lt;groupId&gt;wsdl4j&lt;/groupId&gt;
	&lt;artifactId&gt;wsdl4j&lt;/artifactId&gt;
&lt;/dependency&gt;
&lt;dependency&gt;
	&lt;groupId&gt;org.glassfish.jaxb&lt;/groupId&gt;
	&lt;artifactId&gt;jaxb-runtime&lt;/artifactId&gt;
	&lt;version&gt;2.3.2&lt;/version&gt;
	&lt;scope&gt;runtime&lt;/scope&gt;
&lt;/dependency&gt;
```

Kolejnym krokiem jest dodanie wtyczki jaxb2 do procesu budowania. Będziemy z niej korzystać w celu wygenerowania schematu `.xsd` (ang. XML Schema Definition). Plik ten zostanie również dodany do dokumentu WSDL. Źródłem informacji potrzebnych do stworzenia schematu będą odpowiednio adnotowane klasy Java.

```xml
&lt;plugin&gt;
	&lt;groupId&gt;org.codehaus.mojo&lt;/groupId&gt;
	&lt;artifactId&gt;jaxb2-maven-plugin&lt;/artifactId&gt;
	&lt;version&gt;2.4&lt;/version&gt;
	&lt;executions&gt;
		&lt;execution&gt;
			&lt;id&gt;schemagen&lt;/id&gt;
			&lt;phase&gt;generate-sources&lt;/phase&gt;
			&lt;goals&gt;
				&lt;goal&gt;schemagen&lt;/goal&gt;
			&lt;/goals&gt;
		&lt;/execution&gt;
	&lt;/executions&gt;
	&lt;configuration&gt;
		&lt;sources&gt;
			&lt;source&gt;${basedir}/src/main/java/io/github/t3rmian/jmetersamples/data&lt;/source&gt;
			&lt;source&gt;${basedir}/src/main/java/io/github/t3rmian/jmetersamples/controller/dto&lt;/source&gt;
			&lt;source&gt;${basedir}/src/main/java/io/github/t3rmian/jmetersamples/controller/ws/dto&lt;/source&gt;
		&lt;/sources&gt;
		&lt;outputDirectory&gt;${project.build.directory}/classes&lt;/outputDirectory&gt;
		&lt;transformSchemas&gt;
			&lt;transformSchema&gt;
				&lt;uri&gt;https://github.com/t3rmian/jmeter-samples&lt;/uri&gt;
				&lt;toPrefix&gt;t3r&lt;/toPrefix&gt;
				&lt;toFile&gt;users.xsd&lt;/toFile&gt;
			&lt;/transformSchema&gt;
		&lt;/transformSchemas&gt;
	&lt;/configuration&gt;
&lt;/plugin&gt;
```

Jako ścieżkę w konfiguracji źródeł podaj pakiety z klasami z adnotacjami JAXB (przejdziemy do nich za moment). W przypadku katalog wyjściowego, wygenerowany schemat (podczas fazy generowania kodu źródłowego do dodania przy kompilacji) najlepiej umieścić na ścieżce `target/classes`. W ten sposób Spring Boot (Web) obsłuży go jako zasób. Na koniec możesz również edytować konfiguracje transformacji w zależności od potrzeb. Nie zapomnij nazwy umieszczonej w elemencie 'toFile. Użyjemy jej podczas implementacji generowania pliku WSDL. Jeśli postanowisz nie używać transformacji to wiedz, że nazwy schematów zostaną automatycznie ustawione na wzór `schema1.xsd`.

### DTO (Data Transfer Objects)

Jako przykładowej odpowiedzi web serwisu użyjemy prostego modelu użytkownika. Zauważ, że nazwa przysporzy nam problemów w przyszłości i za chwilę pokażę dlaczego. W celu uproszczenia pominę definicje powiązanych klas (możesz je sprawdzić w projekcie źródłowym, do którego odnośnik znajduje się na górze strony). `@XML...` to adnotacje JAXB. Na ich podstawie stworzony zostanie odpowiedni schemat XSD.

```java
@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "user", propOrder = {
        "id",
        "name",
        "email",
        "registrationDate",
        "profiles"
})
public class User {
    @XmlElement(required = true)
    private Long id;

    @XmlElement
    private String name;

    @XmlElement(required = true)
    private String email;

    @XmlElement(required = true)
    @XmlSchemaType(name = "dateTime")
    private Date registrationDate;

    @XmlTransient
    private Date removalDate;

    @XmlElement
    @XmlSchemaType(name = "profile", namespace = WSEndpoint.NAMESPACE_URI)
    private Set<Profile> profiles;

    /* gettery/settery */
}
```

Dodatkowo polecam zastosować adnotację `@XmlSchema` na poziomie pakietu, w celu oznaczenia własnej, domyślnej przestrzeni nazw. Późniejsze odwołanie do jej elementów jest dosyć proste i odbywa się za pomocą adnotacji `@XmlSchemaType` jak zostało to przedstawione powyżej.

```java
@XmlSchema(
        namespace = WSEndpoint.NAMESPACE_URI,
        elementFormDefault = XmlNsForm.QUALIFIED
)
package io.github.t3rmian.jmetersamples.data;

import io.github.t3rmian.jmetersamples.controller.ws.WSEndpoint;

import javax.xml.bind.annotation.XmlNsForm;
import javax.xml.bind.annotation.XmlSchema;
```

`WSEndpoint.NAMESPACE_URI` to wspólna wartość URI przyjęta dla naszego przykładowego projektu. W zależności od złożoności oraz liczby interfejsów możesz chcieć zdefiniować wiele przestrzeni nazw na potrzeby ponownego wykorzystania, współdzielenia i/bądź łatwiejszego utrzymania.

```java
public interface WSEndpoint {
    String NAMESPACE_URI = "https://github.com/t3rmian/jmeter-samples";
}

```

Każda odpowiedź musi być poprzedzona żądaniem, dlatego też musimy stworzyć odpowiednią do tego klasę. Dla przykładu zaimplementujmy odpowiednik usługi REST-owej GET `/user/:id` przy wykorzystaniu SOAP-a.

```java
/**
 * Kontekst użytkownika operacji
 */
@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "userPayload", propOrder = {
        "id"
})
public class UserPayload {
    @XmlElement(required = true)
    private long id;

    /* gettery/settery */
}

```

### Punkt końcowy usługi

Przechodząc teraz do części właściwej — zajmiemy się implementacją punktu końcowego usługi (ang. **endpoint**). Standardowym podejściem jest dodanie adnotacji `@Endpoint` oraz zaimplementowanie operacji. Za pomocą `@PayloadRoot` należy oznaczyć element główny. Odpowiednia operacja zostanie później (podczas przetwarzania zapytania) wybrana na podstawie tego elementu. Konieczne jest również użycie adnotacji `@XmlRootElement` na definicji klasy tego elementu z powiązaną nazwą. W celu objaśnienia działania frameworku skorzystamy jednak z nieco innego podejścia. Dodaj adnotację `@ResponsePayload` do metody (operacji/odpowiedzi) oraz `@RequestPayload` do parametru (zapytania).

Teraz wspomnę o przyjętym sposobie nazywania elementów w Spring-WS. Standardowa implementacja generowania WSDL-a bazuje na nazwach elementów głównych, a dokładniej przyrostkach. Domyślnie zapytania powinny kończyć się przyrostkiem *Request*, odpowiedzi — *Response*, a błędy (co tu nie zgadywać) nazwą *Fault*. Oczywiście nie ma problemu ze zmianą standardowo przyjętych przyrostków, jednak mechanizm pozostaje taki sam. Framework stworzy odpowiedniki operacji, a wiadomości zostaną połączone według tej samej nazwy podstawowej (po odjęciu przyrostków). W tym przypadku *getUserRequest*, *getUserResponse* oraz *getUserFault* zostaną powiązane w operację *getUser*.

```java
@Endpoint
public class UserEndpoint implements WSEndpoint {
    private UserService userService;
    private ObjectFactory objectFactory;

    @Autowired
    public UserEndpoint(UserService userService) {
        this.userService = userService;
        this.objectFactory = new ObjectFactory();
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "getUserRequest")
    @ResponsePayload
    public JAXBElement<User> getUser(@RequestPayload UserPayload userPayload) {
        User user = userService.getUser(userPayload.getId());
        return objectFactory.createGetUserResponse(user);
    }
}
```

Wszelkie odstępstwa od tej reguł spowodują wygenerowanie nieprawidłowo połączonych operacji w pliku WSDL. Jest jednak kilka sposobów również na to i pokaże Ci dwa z nich. Dlaczego takie podejście jest problematyczne, zapytasz. Cóż, w niektórych przypadkach może zajść potrzeba ponownego wykorzystania tego samego elementu, bez tworzenia zbędnego kodu. Powyżej można zauważyć dosyć nietypową klasę *ObjectFactory*. Jest to klasa, która w definicji adnotowana jest poprzez `@ XmlRegistry` i oznacza fabrykę metod, które zostaną wykorzystane do zmapowania elementów schematu (`@XmlElementDecl`). Jest to alternatywa dla użycia adnotacji `@XmlRootElement` w definicji klasy głównego elementu. Drugim rozwiązaniem naszego "problemu akademickiego" jest po prostu wykorzystanie klas pochodnych z adnotacją korzenia.

```java
@XmlRegistry
public class ObjectFactory {

    private interface QNames {
        QName getUserRequest = new QName(WSEndpoint.NAMESPACE_URI, "getUserRequest");
        QName getUserResponse = new QName(WSEndpoint.NAMESPACE_URI, "getUserResponse");
        QName commonFault = new QName(WSEndpoint.NAMESPACE_URI, "commonFault");
    }

    @XmlElementDecl(namespace = WSEndpoint.NAMESPACE_URI, name = "getUserRequest")
    public JAXBElement<UserPayload> createGetUserRequest(UserPayload value) {
        return new JAXBElement<>(QNames.getUserRequest, UserPayload.class, null, value);
    }

    @XmlElementDecl(namespace = WSEndpoint.NAMESPACE_URI, name = "getUserResponse")
    public JAXBElement<User> createGetUserResponse(User value) {
        return new JAXBElement<>(QNames.getUserResponse, User.class, null, value);
    }

    @XmlElementDecl(namespace = WSEndpoint.NAMESPACE_URI, name = "commonFault")
    public JAXBElement<ErrorResponse> createCommonFault(ErrorResponse value) {
        return new JAXBElement<>(QNames.commonFault, ErrorResponse.class, null, value);
    }

}
```

W tym podejściu tworzymy elementy JAXB własnoręcznie i wiążemy je za pomocą nazw określających (ang. qualified name). Dlatego też jako odpowiedź zwracamy naszą odpowiedź opakowaną w element `JAXBElement<User>` a nie samo DTO `User`. Zauważ wykorzystanie nazwy *commonFault* dla błędu o typie *ErrorResponse*. Jak myślisz, czy element (wiadomość) ten zostanie poprawnie połączony z operacją *getUser*?

### Generowanie dokumentu WSDL

Do skończenia MVP (ang. Minimum Viable Product) niezbędne jest jeszcze wygenerowanie specyfikacji WSDL i zarejestrowanie web serwisu. Potrzebujemy do tego trzech beanów. Pierwszy z nich - *MessageDispatcherServlet* posłuży do załadowania kontekstu dla web serwisów (działa na podobnej zasadzie co *DispatcherServlet* w Spring MVC). Następnie, wygenerowaniem dokumentu WSDL zajmie się *DefaultWsdl11Definition*. W tym miejscu można również skonfigurować sufiksy. Trzeci bean to *XsdSchema* powiązany z wygenerowanym schematem, który konfigurowaliśmy przed chwilą. Nie rozpraszaj się na razie obecnością *ReflectionWsdl11Definition*, za moment opiszę zastosowane tu rozwiązanie. Ostatnią rzeczą, o której warto pamiętać, jest dodanie adnotacji `@EnableWs` do `@Configuration` tak, aby Spring Boot załadował odpowiednie mapowania i adaptery web serwisów (*[WsConfigurationSupport](https://docs.spring.io/spring-ws/docs/current/api/org/springframework/ws/config/annotation/WsConfigurationSupport.html)*).


```java
    @Bean
    public ServletRegistrationBean messageDispatcherServlet(ApplicationContext applicationContext) {
        MessageDispatcherServlet servlet = new MessageDispatcherServlet();
        servlet.setApplicationContext(applicationContext);
        servlet.setTransformWsdlLocations(true);
        return new ServletRegistrationBean<>(servlet, "/ws/*");
    }

    @Bean(name = "users")
    public DefaultWsdl11Definition defaultWsdl11Definition(XsdSchema usersSchema) {
        DefaultWsdl11Definition wsdl11Definition = new ReflectionWsdl11Definition();
        wsdl11Definition.setPortTypeName("Users");
        wsdl11Definition.setLocationUri("/ws");
        wsdl11Definition.setTargetNamespace(WSEndpoint.NAMESPACE_URI);
        wsdl11Definition.setSchema(usersSchema);
        wsdl11Definition.setRequestSuffix("Request");
        wsdl11Definition.setResponseSuffix("Response");
        wsdl11Definition.setFaultSuffix("commonFault");
        return wsdl11Definition;
    }

    @Bean
    public XsdSchema usersSchema() {
        return new SimpleXsdSchema(new ClassPathResource("users.xsd"));
    }
```

### Błędy SOAP (Faults)

Chwila! Czy nie zapomnieliśmy o czymś? No tak, mamy jeszcze odpowiedzi błędów. Domyślnie (*WsConfigurationSupport*) wyjątki są odpowiednio konwertowane na błędy SOAP. Co jednak w sytuacji, gdy chcemy dostosować informację zwrotną? W takim przypadku można użyć adnotacji `@SoapFault` przy wyjątku w celu ustawienia odpowiedniej wiadomości. Często jednak to nie wystarcza. Na ratunek przychodzi *SoapFaultMappingExceptionResolver*. To dosyć prosta, a zarazem funkcjonalna klasa, którą możemy przekształcić w beana. Z wysokopoziomowego punktu widzenia pozwala ona na ustawienie standardowego błędu odpowiedzi oraz mapowań dla znanych wyjątków. Co więcej, zapewnia ona możliwość dodania szczegółów (*detail*) do odpowiedzi błędu. Zagłębiając się bardziej — można w niej dodawać również elementy z własnej przestrzeni nazewniczej.

```java
    @Bean
    public SoapFaultMappingExceptionResolver exceptionResolver() throws JAXBException {
        SoapFaultMappingExceptionResolver exceptionResolver = new SoapFaultExceptionResolver();

        SoapFaultDefinition faultDefinition = new SoapFaultDefinition();
        faultDefinition.setFaultCode(SoapFaultDefinition.SERVER);
        exceptionResolver.setDefaultFault(faultDefinition);

        Properties errorMappings = new Properties();
        errorMappings.setProperty(Exception.class.getName(), SoapFaultDefinition.SERVER.toString());
        errorMappings.setProperty(ClientException.class.getName(), SoapFaultDefinition.CLIENT.toString());
        errorMappings.setProperty(DataIntegrityViolationException.class.getName(), SoapFaultDefinition.CLIENT.toString());
        exceptionResolver.setExceptionMappings(errorMappings);
        exceptionResolver.setOrder(1);
        return exceptionResolver;
    }
```

W implementacji resolvera powinniśmy nadpisać metodę `customizeFault`. Poprzez argumenty funkcji dostęp uzyskamy do  punktu końcowego usługi, wyjątku oraz domyślnego obiektu błędu. Idealnie byłoby umieścić w tym miejscu logikę mapowania błędów wewnętrznych na błąd SOAP i dodanie własnych elementów pod `fault.addFaultDetail().getResult()`. Do tego celu posłużyć może marshaller JAXB. Porządany element tworzymy za pomocą wcześniej wspomnianej klasy *ObjectFactory*. Przykładowy kod znajduje się poniżej. Możesz tutaj użyć również czegoś prostszego w stylu `fault.addFaultDetail().addFaultDetailElement(qName).addText()`.

```java
public class SoapFaultExceptionResolver extends SoapFaultMappingExceptionResolver {

    private static final Logger logger = LoggerFactory.getLogger(SoapFaultExceptionResolver.class);

    private final RestErrorHandler errorHandler = new RestErrorHandler();
    private final JAXBContext jaxbContext = JAXBContext.newInstance(ErrorResponse.class);
    private final Marshaller marshaller = jaxbContext.createMarshaller();
    private final ObjectFactory objectFactory = new ObjectFactory();

    public SoapFaultExceptionResolver() throws JAXBException {
    }

    @Override
    protected void customizeFault(Object endpoint, Exception ex, SoapFault fault) {
        ErrorResponse errorResponse;
        if (ex instanceof ClientException) {
            errorResponse = errorHandler.processClientException((ClientException) ex);
        } else if (ex instanceof DataIntegrityViolationException) {
            errorResponse = errorHandler.processDataIntegrityViolationException((DataIntegrityViolationException) ex);
        } else {
            logger.error("Unmapped SOAP exception", ex);
            errorResponse = new ErrorResponse();
            errorResponse.setTime(new Date());
        }

        try {
            marshaller.marshal(objectFactory.createCommonFault(errorResponse), fault.addFaultDetail().getResult());
        } catch (JAXBException e) {
            logger.warn("Exception thrown while marshalling fault response", e);
        }
    }
}
```

W tym miejscu pominę opis klasy *RestErrorHandler* jako iż miałem ją już pod ręką. Jej zadaniem jest zmapowanie błędu biznesowego na prosty obiekt DTO:

```java
@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "errorFault", propOrder = {
        "error",
        "time"
})
public class ErrorResponse {
    @XmlElement
    private String error;

    @XmlElement(required = true)
    @XmlSchemaType(name = "dateTime")
    private Date time;

    /* gettery/settery */
```

### Wspólna definicje błędu SOAP

Dodaliśmy więc niestandardową definicję błędu SOAP wraz z obsługą wyjątków i tworzeniem odpowiedzi. Jeśli jednak spróbujemy teraz wygenerować specyfikację to nie zostaną ona poprawnie powiązana w operacji. Pamiętasz o przyrostkach? Podstawowa nazwa nie będzie pasować do nazwy operacji *getUser*. Powinniśmy byli utworzyć elementy błędu odpowiadające nazwie podstawowej każdej z operacji. Nie chcemy jednak tego robić! Chcemy, aby definicja błędu była współdzielona bez zbędnych problemów. Sprawdźmy więc, jak można zaimplementować bądź nadpisać standardowe rozwiązanie oparte na przyrostkach.

*DefaultWsdl11Definition* wygląda na całkiem dobre dla nas rozwiązanie, przynajmniej do pewnego momentu. Spróbujmy je więc rozszerzyć. Jeśli zerkniesz na domyślną implementację, zobaczysz, że generowanie WSDL odbywa się w metodzie `afterPropertiesSet()` (inicjalizacja beana). Właściwie to główna praca delegowana jest do *ProviderBasedWsdl4jDefinition*. Niestety pola w poprzedniej klasie są *private final* i nie mają żadnych getterów ani przydatnych metod do nadpisania w celu uzyskania dostępu do tego delegata. Dobrym rozwiązaniem byłoby więc wykorzystanie samej klasy *ProviderBasedWsdl4jDefinition*, ale dla potrzeb tego dema użyjemy wcześniej wspomnianej klasy *DefaultWsdl11Definition* i mechanizmu refleksji.

Za pomocą refleksji możemy uzyskać dostęp do delegata i po tym, jak właściwości zostaną ustawione (`afterPropertiesSet()`), możemy dowiązać współdzieloną definicję (wiadomość) błędu. Użycie refleksji nie jest najlepszym rozwiązaniem, ale znacznie zmniejsz ilość kodu dla tego przykładu.

```java
public class ReflectionWsdl11Definition extends DefaultWsdl11Definition {
    private String commonFaultSuffix;

    @Override
    public void afterPropertiesSet() throws Exception {
        super.afterPropertiesSet();
        Field field = this.getClass().getSuperclass().getDeclaredField("delegate");
        field.setAccessible(true);
        ProviderBasedWsdl4jDefinition delegate = (ProviderBasedWsdl4jDefinition) field.get(this);
        addCommonFaults(delegate.getDefinition());
    }

    private void addCommonFaults(Definition definition) {
        for (Object portType : definition.getPortTypes().values()) {
            for (Object operation : ((PortType) portType).getOperations()) {
                addCommonFault(definition, ((Operation) operation));
            }
        }
    }

    private void addCommonFault(Definition definition, Operation operation) {
        for (Object message : definition.getMessages().values()) {
            Message msg = (Message) message;
            if (isFaultMessage(msg)) {
                operation.addFault(createCommonFault(definition, msg));
            }
        }
    }

    @Override
    public void setFaultSuffix(String faultSuffix) {
        super.setFaultSuffix(faultSuffix);
        this.commonFaultSuffix = faultSuffix;
    }

    private boolean isFaultMessage(Message message) {
        String messageName = message.getQName().getLocalPart();
        return messageName != null && messageName.contains(commonFaultSuffix);
    }

    private Fault createCommonFault(Definition definition, Message message) {
        Fault fault = definition.createFault();
        fault.setMessage(message);
        fault.setName(fault.getMessage().getQName().getLocalPart());
        return fault;
    }
}
```

### Wdrożenie

Na koniec wywołaj `mvn clean install` bądź `mvn jaxb2:schemagen` w celu wygenerowania schematu XSD. W razie braku Mavena, możesz skorzystać z nakładki `mvnw` z przykładowego projektu. Następnie uruchom aplikację (poprzez IDE bądź wywołując `mvn spring-boot:run`). Dokument WSDL powinien zostać wygenerowany podczas startu. Jeśli wszystko zostało skonfigurowane poprawnie, to WSDL dostępny będzie pod adresem (w naszym przypadku)  http://localhost:8080/ws/users.wsdl. Teraz możesz załadować usługę w SoapUI bądź skorzystać z narzędzia *curl*.

```xml
&lt;soapenv:Envelope xmlns:soapenv=&quot;http://schemas.xmlsoap.org/soap/envelope/&quot; xmlns:t3r=&quot;https://github.com/t3rmian/jmeter-samples&quot;&gt;
   &lt;soapenv:Header/&gt;
   &lt;soapenv:Body&gt;
      &lt;t3r:getUserRequest&gt;
         &lt;t3r:id&gt;1&lt;/t3r:id&gt;
      &lt;/t3r:getUserRequest&gt;
   &lt;/soapenv:Body&gt;
&lt;/soapenv:Envelope&gt;
```

```xml
&lt;SOAP-ENV:Envelope xmlns:SOAP-ENV=&quot;http://schemas.xmlsoap.org/soap/envelope/&quot;&gt;
   &lt;SOAP-ENV:Header/&gt;
   &lt;SOAP-ENV:Body&gt;
      &lt;ns2:getUserResponse xmlns:ns2=&quot;https://github.com/t3rmian/jmeter-samples&quot;&gt;
         &lt;ns2:id&gt;1&lt;/ns2:id&gt;
         &lt;ns2:name&gt;doe&lt;/ns2:name&gt;
         &lt;ns2:email&gt;doe@example.com&lt;/ns2:email&gt;
         &lt;ns2:registrationDate&gt;2019-07-11T20:21:56.258+02:00&lt;/ns2:registrationDate&gt;
         &lt;ns2:profiles&gt;
            &lt;ns2:id&gt;2&lt;/ns2:id&gt;
            &lt;ns2:externalId&gt;doeLinkedInId&lt;/ns2:externalId&gt;
            &lt;ns2:type&gt;LINKEDIN&lt;/ns2:type&gt;
         &lt;/ns2:profiles&gt;
         &lt;ns2:profiles&gt;
            &lt;ns2:id&gt;3&lt;/ns2:id&gt;
            &lt;ns2:externalId&gt;doeTwitterId&lt;/ns2:externalId&gt;
            &lt;ns2:type&gt;TWITTER&lt;/ns2:type&gt;
         &lt;/ns2:profiles&gt;
      &lt;/ns2:getUserResponse&gt;
   &lt;/SOAP-ENV:Body&gt;
&lt;/SOAP-ENV:Envelope&gt;
```

```xml
&lt;SOAP-ENV:Envelope xmlns:SOAP-ENV=&quot;http://schemas.xmlsoap.org/soap/envelope/&quot;&gt;
   &lt;SOAP-ENV:Header/&gt;
   &lt;SOAP-ENV:Body&gt;
      &lt;SOAP-ENV:Fault&gt;
         &lt;faultcode&gt;SOAP-ENV:Client&lt;/faultcode&gt;
         &lt;faultstring xml:lang=&quot;en&quot;&gt;User with id 2 not found&lt;/faultstring&gt;
         &lt;detail&gt;
            &lt;ns2:commonFault xmlns:ns2=&quot;https://github.com/t3rmian/jmeter-samples&quot;&gt;
               &lt;ns2:error&gt;User with id 2 not found&lt;/ns2:error&gt;
               &lt;ns2:time&gt;2019-07-11T20:24:02.701+02:00&lt;/ns2:time&gt;
            &lt;/ns2:commonFault&gt;
         &lt;/detail&gt;
      &lt;/SOAP-ENV:Fault&gt;
   &lt;/SOAP-ENV:Body&gt;
&lt;/SOAP-ENV:Envelope&gt;
```

Nie zapomnij włączyć walidacji podczas testowania interfejsu. W SoapUI możesz to zrobić zaznaczając pola *Validate Requests* oraz *Validate Responses* w menu *-> File -> Preferences -> Editor Setting*. Jeśli natkniesz się na jakiekolwiek problemy, zawsze możesz spojrzeć na przykładowy projekt u góry strony. Z góry uprzedzam, że przy użyciu nowszych wersji JDK możesz napotkać [nieprzewidziane błędy](https://github.com/mojohaus/jaxb2-maven-plugin/issues/129). W celu uzyskania większej kontroli nad definicją schematu XSD polecam [JAXB-Facets](https://github.com/whummer/jaxb-facets).