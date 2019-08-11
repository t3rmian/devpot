---
title: Contract-last Spring Web Services
url: contract-last-spring-ws
id: 8
tags:
  - spring
  - soap
  - web services
author: Damian Terlecki
date: 2019-07-14T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

Searching through the web (or just looking at the docs), you will probably find that Spring-WS has been build with contract-first development style in mind.
For a quick review contract-first (top-down) naming is used to denote the approach in which we create the WSDL specification first and based on that the necessary classes (stubs) are generated. In contrast to this, there is also a contract-last (bottom-up) approach where the specification is generated from the classes (usually based on annotations).

In general, the top-down approach is the recommended way due to easier maintenance, versioning, reusability and loose coupling. You need to, however, have some base understanding of SOAP specification to write correct WSDL. Sometimes, though, a bottom-up approach can be preferred due to this fact. In such a case, the knowledge of WSDL is not required and the development is usually less time-consuming. Yet, as you might expect, this style does not have the pros of contract-first approach.

JAX-WS is a pretty valid choice for any of the mentioned development styles. How about Spring? Does it only support the top-down approach? I was very curious about this and picked this route for a sample project (link at the top) to check if this is true. It was quite a lesson, but in my opinion, contract-last is also a viable option with *spring-ws*. However, if you stray off from a standard way of defining web services which Spring somewhat imposes it might be quite challenging and hard to maintain later on. Nevertheless, let's see what brings us *spring-ws* and how we can use it for contract-last development style.

### POM Configuration

Firstly, we will need some basic dependencies. I recommend using `spring-boot-starter-parent` as the parent project. You will also probably use `spring-boot-starter-data-jpa` and `spring-boot-starter-web`. They can be picked in the **Spring Initializr**. For sure we would also need the package with web services support, together with *wsdl4j* generator to produce the specification.

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

Next, add jaxb2 plugin to the build process. We will use it to generate XML Schema Definition (`.xsd`) for our web service. This file will also be added to the WSDL document. The information for generating the schema will come from Java classes.

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
Point the paths in the configuration of the sources to your JAXB annotated classes (we will mention them in a minute). For output directory, we will put the schema (during generate-sources phase) under `target/classes` so that Spring Boot (Web) can pick it up and serve it as a resource. Lastly, you can modify transform schema to your need. Do not forget to enter 'toFile' name. We will refer to it during the creation of WSDL. In case you don't use transform schemas, you will end up with files names like `schema1.xsd`.

### Data Transfer Objects

For our response, we will use some simple `User` model. Note that this name will be later a source of some problems and I will show you why. To simplify, I will skip the definition of dependent classes (you can check it at the top, in the project sources). `@XML...` are JAXB annotations. By processing them, the schema will be generated.

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

    /* getters/setters */
}
```
Additionally, I recommend using a package level `@XmlSchema` annotation to denote our own namespace. Later on, you can reference complex elements from your own namespace using `@XmlSchemaType` like shown above.

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

`WSEndpoint.NAMESPACE_URI` is used here to share the same namespace across all elements in the sample project. Depending on the complexity, you might want to have multiple namespaces for reusability and maintenance purposes.

```java
public interface WSEndpoint {
    String NAMESPACE_URI = "https://github.com/t3rmian/jmeter-samples";
}

```

Each response is preceded by a request, which is why we also have to create an appropriate class. Let's implement an equivalent of a REST GET `/user/:id` service using SOAP.

```java
/**
 * User context for the operation
 */
@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(name = "userPayload", propOrder = {
        "id"
})
public class UserPayload {
    @XmlElement(required = true)
    private long id;

    /* getters/setters */
}

```

### Endpoint

Moving now to the core — let's implement the endpoint. A default approach is to annotate it with `@Endpoint` annotation and write an implementation of our operation. `@PayloadRoot` is used to denote the name of the primary element. The correct operation will be picked by this element. It's also necessary to use a matching `@XmlRootElement` annotation on the class definition, but we will use a slightly different approach. Annotate the response with `@ResponsePayload` and the request with `@RequestPayload`.

Here is a little quirk of Spring-WS. The default implementation of WSDL generation works based on name suffixes. Request elements should end up with *Request* suffix, responses with *Response* suffix and, as you might have guessed, faults with *Fault* suffix. It's easy to change the suffixes, however, the mechanism stays the same. The framework creates necessary messages and the operation is combined using same base name, i.e. *getUserRequest*, *getUserResponse* and *getUserFault* will end up in a *getUser* operation.

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

Any deviations from this rule will cause a generation of improperly linked operations in your WSDL. However, there are a few ways around this and I will show you two of them. Why is it a problem, you might ask. Well, there might come a situation where you would like to reuse the same element in multiple places without creating redundant code. Above you can see that there is an uncommon class *ObjectFactory*. This class has a `@XmlRegistry` annotation that marks a factory with methods used for mapping schema elements (`@XmlElementDecl`). This results in the same output as mentioned before `@XmlRootElement`. The alternative is to use multiple derivative classes with the root annotation.

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

By using this approach we have to create JAXB elements and bind them using qualified names with appropriate classes. This is why in the endpoint operation `JAXBElement<User>` is returned and not `User`. Note *commonFault* name for the *ErrorResponse*. Do you think it will be correctly combined with *getUser* operation?

### Generating WSDL

To finish the MVP (Minimum Viable Product) we need to generate the WSDL and register the web service. Three beans are needed for this. Firstly, *MessageDispatcherServlet* is used to load the web services context (just like Spring MVC *DispatcherServlet*). Next, the *DefaultWsdl11Definition* will generate the specification with schema provided by the third bean returning *XsdSchema*. Here you can set the aforementioned suffixes. Don't get distracted by *ReflectionWsdl11Definition* yet, we will come back to this in a moment. Don't forget to add `@EnableWs` annotation to your `@Configuration` so that the Spring Boot will load necessary WS mappings provided by *[WsConfigurationSupport](https://docs.spring.io/spring-ws/docs/current/api/org/springframework/ws/config/annotation/WsConfigurationSupport.html)*.

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

### SOAP Faults

Hey! Haven't we forgotten something? What about error responses a.k.a. SOAP Faults. By default when an exception is thrown, it should get converted into a standard fault (depending on the SOAP version). But what if we want to customize it with additional information? You can use `@SoapFault` annotation to set specific message but that's often not enough. *SoapFaultMappingExceptionResolver* comes to the rescue. This simple, yet powerful class can be converted into bean to support customized SOAP Faults. From the high-level point of view — it offers some nice features like setting default faults and codes for known exceptions. But what's more, it provides a way to add detail elements to the Fault, or even better — an option to add custom elements from your own namespace under it.

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

In the implementation of the resolver, we can override `customizeFault` method. Through the parameters, we get access to the endpoint, exception and default fault objects. Ideally you would put some error mapping logic there and add your element under `fault.addFaultDetail().getResult()`. This can be done using JAXB Marshaller. The element can be created using *ObjectFactory* mentioned in the **Endpoint** paragraph. Sample code can be seen below. You can also use something simpler here, like `fault.addFaultDetail().addFaultDetailElement(qName).addText()`.

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

I will skip the description of *RestErrorHandler* as I only reused it because I had it at hand. It's supposed to map business errors into error response with some simple information:

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

    /* getters/setters */
```

### Common SOAP Fault

So, we have implemented a custom SOAP Fault, but if you try to generate the specification right now, it won't be properly bound in an operation. Remember the suffix part? The base name does not match the base name of *getUser* operation. Again, we would have to create fault elements matching the base name for each operation. But that is not our desire! We want to make it common! Let's see how we can achieve that. With a similar approach, you will also be able to customize request and response default suffix-based implementation.

*DefaultWsdl11Definition*, looks like a fine solution for our needs up to some point. Let's extend it. If you check the implementation, you will see that the WSDL generation is done in the `afterPropertiesSet()` method (bean initialization). Actually, it's the *ProviderBasedWsdl4jDefinition* delegate that does the main work here. Unfortunatelly, the fields in the previous class are *private final* and there are no getters to access this delegate. Ideally, you would want to use *ProviderBasedWsdl4jDefinition* instead, but for this demo, we will reuse *DefaultWsdl11Definition* thanks to the reflection mechanism.

Get the reference to the private delegate and after properties are set, create and add a common fault message definition to each operation. It's not the best approach to use reflection but it does the job and reduces boilerplate code for this sample.

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

### Serving the web service

Finally, run `mvn clean install` or `mvn jaxb2:schemagen` to generate the XSD. In case you don't have Maven installed, you can use `mvnw` wrapper from the sample project. After that, start your Spring Boot application (IDE or by executing `mvn spring-boot:run`) and the WSDL should be generated during the start. If everything's set up properly, you will be able to access your WSDL (in this sample case) at http://localhost:8080/ws/users.wsdl. Load it in the SoapUI or use *curl*.

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

Don't forget to enable validation when testing the interface. In SoapUI you can do so by ticking *Validate Requests* and *Validate Responses* checkboxes in the menu *-> File -> Preferences -> Editor Setting*. If you stumble upon any problems, you can always compare with the sample project. The link can be found at the top of the page. Note that you may encounter [unforeseen errors](https://github.com/mojohaus/jaxb2-maven-plugin/issues/129) when using (compiling with) newer versions of JDK. For more control over the XSD generation, I recommend [JAXB-Facets](https://github.com/whummer/jaxb-facets).