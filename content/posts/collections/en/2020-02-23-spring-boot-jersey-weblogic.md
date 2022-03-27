---
title: Deploying Spring Boot with Jersey on WebLogic
url: spring-boot-jersey-weblogic
id: 24
category:
  - jee: JEE
tags:
  - weblogic
  - spring
  - classloading
author: Damian Terlecki
date: 2020-02-23T20:00:00
---

Why would you ever want to have your Spring Boot application deployed on a Java Enterprise Application Server like WebLogic? The reasons may vary but usually, they all go under that scope of some corporate requirements. For example, there already might be a standardized system for software development with tools to which you must adapt. But is it possible to run Spring on an application server? And what's this whole JAX-RS thing that Java EE offers? How do I even bite this? Let's do this in small steps on the example of Spring Boot 2, WebLogic 12.2.1.3.0/12.2.1.4.0 and Jersey 1.x/2.x.

## From an Embedded Web Server (JAR) to a Web Application (WAR)

Spring Boot applications are usually built into jars with embedded web servers. This is done thanks to the starter dependencies. For example, the primary web starter `spring-boot-starter-web` by default includes 'spring-boot-starter-tomcat' which in turn includes `tomcat-embed-core`. Of course, Tomcat is not the only viable option for choosing an embedded web server. Spring Boot also provides other starters like Jetty `spring-boot-starter-jetty` and Undertow `spring-boot-starter-undertow`. 

```xml
<properties>
	<servlet-api.version>3.1.0</servlet-api.version>
</properties>
<!-- Usual initial configuration -->
<dependency>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-web</artifactId>
	<exclusions>
		<!-- Exclude the Tomcat dependency if you decide to use a different Web Server -->
		<exclusion>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-tomcat</artifactId>
		</exclusion>
	</exclusions>
</dependency>
<!-- For an example, you can use Jetty instead -->
<dependency>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

The first step on the road to the Application Server is to remove the embedded web server from the JAR and switch to WAR packaging. With web application archive (WAR) we will be able to deploy our web application not only on an application server (WebLogic) but also on a dedicated web server (Tomcat). This is quite easy and requires switching from `<packaging>jar</packaging>` to `<packaging>war</packaging>`.

Secondly, we have to switch the web server starter dependency from the default `compile` scope to `provided`. This way the relevant classes will not be packaged into the WAR, as we will expect the container to provide necessary dependencies at the runtime.

```xml
<!-- Replace spring-boot-starter-tomcat with chosen web server starter and set the scope to provided -->
<dependency>
   <groupId>org.springframework.boot</groupId>
   <artifactId>spring-boot-starter-tomcat</artifactId>
   <scope>provided</scope>
</dependency>
```

Ok, but aren't we missing something? With the JAR method, we specified the main method for the build package phase in the `spring-boot-maven-plugin`:

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <mainClass>com.example.app.Main</mainClass>
    </configuration>
</plugin>
```

To load your Spring application configuration in the container environment, we have to set up the starting point equivalent of the main method (which will configure the dispatcher, filters, servlets and listeners). Keep in mind that this configuration is for Servlet API 3.1+ (Spring Boot 2 + WLS 12.2.1). For legacy versions, [spring-boot-legacy](https://github.com/dsyer/spring-boot-legacy) might be helpful.

Back to the topic – we have to extend `SpringBootServletInitializer` and provide our configuration sources. What's more, depending on the version, we might need to implement `WebApplicationInitializer` again, even though the `SpringBootServletInitializer` already implements it. Otherwise, WebLogic does not pick up this class. This is a bug that has been resolved in version 12.1.3 (patch 16769849). If you're curious, how the mechanism works – check out [SpringServletContainerInitializer javadocs](https://docs.spring.io/spring/docs/current/javadoc-api/org/springframework/web/SpringServletContainerInitializer.html).

```java
@SpringBootApplication
public class Application extends SpringBootServletInitializer implements WebApplicationInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(Application.class);
    }

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

}
```

What's nice is that `spring-boot-maven-plugin` will also take care of packaging the WAR so you don't have to configure `maven-war-plugin` explicitly.

## Jersey on the WebLogic

Application servers have to comply with [JEE specs](https://javaee.github.io/javaee-spec/). Since 12.2.1 is JEE7 certified, WebLogic provides support for Jersey 2.x (JAX-RS 2.0 RI) through explicit registration of a shared library. Version 12.2.1.3.0 provides this support out-of-the-box. The Jersey 1.x server-side APIs are no longer supported but the client packages are still maintained (though deprecated) for backward compatibility. As you can guess, this can get a bit complicated depending on the version of the application server.

In the case of WebLogic and other application servers, you have basically two options. Either comply with the libraries provided by the container or bring your own ones together with the application. The first choice is a valid solution when you start developing your application from scratch. Whereas, the second option is much less painful when your project is already using a set of defined and verified libraries.

To set up this, add a configuration file at `src/main/webapp/WEB-INF/weblogic.xml`. A sample configuration which prefers Jersey libraries packed with the application might look like [this](https://github.com/jersey/jersey/blob/faa809da43538ce31076b50f969b4bd64caa5ac9/tests/mem-leaks/test-cases/bean-param-leak/src/main/webapp/WEB-INF/weblogic.xml):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<wls:weblogic-web-app xmlns:wls="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.0/weblogic-web-app.xsd">

    <wls:container-descriptor>
        <wls:prefer-application-packages>
            <!-- jsr311 -->
            <wls:package-name>javax.ws.rs.*</wls:package-name>
            <!-- javassist -->
            <wls:package-name>javassist.*</wls:package-name>
            <!-- aop repackaged -->
            <wls:package-name>org.aopalliance.*</wls:package-name>

            <!-- jersey 2 -->
            <wls:package-name>jersey.repackaged.*</wls:package-name>
            <wls:package-name>org.glassfish.jersey.*</wls:package-name>
            <wls:package-name>com.sun.research.ws.wadl.*</wls:package-name>

            <!-- hk2 -->
            <wls:package-name>org.glassfish.hk2.*</wls:package-name>
            <wls:package-name>org.jvnet.hk2.*</wls:package-name>
            <wls:package-name>org.jvnet.tiger_types.*</wls:package-name>
        </wls:prefer-application-packages>

        <wls:prefer-application-resources>
            <wls:resource-name>META-INF/services/javax.servlet.ServletContainerInitializer</wls:resource-name>
            <wls:resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</wls:resource-name>

            <!-- jersey -->
            <wls:resource-name>META-INF/services/org.glassfish.jersey.*</wls:resource-name>
            <wls:resource-name>org.glassfish.jersey.*</wls:resource-name>
            <wls:resource-name>jersey.repackaged.*</wls:resource-name>

            <!-- hk2 -->
            <wls:resource-name>META-INF/services/org.glassfish.hk2.*</wls:resource-name>
        </wls:prefer-application-resources>
    </wls:container-descriptor>

</wls:weblogic-web-app>
```

But to know which libraries should be preferred in our case some analysis must be done first, otherwise, we are prone to errors like `java.lang.LinkageError`, `java.lang.NoClassDefFoundError` and `java.lang.ClassNotFoundException`. We need to know which packages are provided by the application server and which come with our application. To detect and resolve such conflicts, Oracle provides the **Classloader Analysis Tool (CAT)**. It's a web application that usually resides at `%WL_HOME%/wlserver/server/lib/wls-cat.war`. By default it is deployed at [localhost:port/wls-cat](http://localhost:7001/wls-cat), so you might want to check it first before deploying it manually using the console. A great reference on how to use this application and resolve conflicts is a [guide on the Syscon Middleware blog](https://blog.sysco.no/class/loader/AnalysingClassLoadingConflicts/).

It might be still quirky to get the `prefer-application-resources` right. It's generally used for defining [service providers](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html) at `/META-INF/services/`. A typical error would say that the provider implementation could not be found:

> **weblogic.application.ModuleException**: org.glassfish.jersey.internal.ServiceConfigurationError: org.glassfish.jersey.server.spi.ComponentProvider: **The class** org.glassfish.jersey.ext.cdi1x.internal.CdiComponentProvider **implementing the provider interface** org.glassfish.jersey.server.spi.ComponentProvider **is not found**. The provider implementation is ignored.:org.glassfish.jersey.internal.ServiceConfigurationError:org.glassfish.jersey.server.spi.ComponentProvider: The class org.glassfish.jersey.ext.cdi1x.internal.CdiComponentProvider implementing the provider interface org.glassfish.jersey.server.spi.ComponentProvider is not found. The provider implementation is ignored.</br>
>	at org.glassfish.jersey.internal.ServiceFinder.fail(ServiceFinder.java:433)</br>
>	at org.glassfish.jersey.internal.ServiceFinder.access$300(ServiceFinder.java:155)</br>
>	at org.glassfish.jersey.internal.ServiceFinder$LazyObjectIterator.handleClassNotFoundException(ServiceFinder.java:806)</br>
>	at org.glassfish.jersey.internal.ServiceFinder$LazyObjectIterator.hasNext(ServiceFinder.java:757)</br>
>	at org.glassfish.jersey.server.ApplicationHandler.getRankedComponentProviders(ApplicationHandler.java:743)</br>
>	Truncated. see log file for complete stacktrace

## Spring

When deploying Spring application on an application server, the more dependencies you pull (JPA/Bean validation) the more conflicts you will have. It's a good idea to keep this in mind during development if you plan on deploying the WebLogic. Lastly, if you want to configure the context-path of your Spring Boot application deployed on the WebLogic, you can do so using mentioned before `weblogic.xml` configuration file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<wls:weblogic-web-app xmlns:wls="http://xmlns.oracle.com/weblogic/weblogic-web-app"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                      http://xmlns.oracle.com/weblogic/weblogic-web-app/1.8/weblogic-web-app.xsd">
  <wls:context-root>my-app</wls:context-root>
</wls:weblogic-web-app>
```

This value will overwrite `server.servlet.context-path` value from `src/main/resources/application.yml` and the application will be server under correct path on the WebLogic.

## Other quirks

There are a few quirks that you might or might not encounter. Knowing about them will save you some time finding out the solutions.

#### ProxyCtl

If you're migrating a complex Spring Boot REST app backed by Jersey, you might get the following error:

> java.lang.IllegalArgumentException: interface org.glassfish.hk2.api.ProxyCtl is not visible from class loader

In such a case, it's a good idea to check whether `@Context HttpServletRequest request` is injected anywhere in your filters/services. There have been similar problems reported [when using Jersey](https://github.com/jersey/jersey/issues/3422). One of the workarounds is to retrieve the `HttpServletRequest` from the `ThreadLocal` properties of `RequestContextHolder`:

```java
((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
```

#### Automatically registered Jersey

JAX-RS application resources can still be scanned by the WebLogic. This would be unfeasible if you're registering the servlet containers explicitly and programmatically in Spring Boot through `ServletRegistrationBean`. You might want to not have some or any of the resources scanned (or change the default mapping). 

<img src="/img/hq/weblogic-jersey-automatically-registered.png" title="Automatically registered REST Service by WebLogic" alt="Automatically registered REST Service by WebLogic">

To do this, just provide a parameter value (empty to disable) for `jersey.config.server.provider.packages` in `src/main/webapp/WEB-INF/web.xml` like so:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="http://java.sun.com/xml/ns/javaee"
  xsi:schemaLocation="http://java.sun.com/xml/ns/javaee http://java.sun.com/xml/ns/javaee/web-app_3_0.xsd"
  version="3.0" metadata-complete="true">
  <servlet>
    <servlet-name>jersey</servlet-name>
    <servlet-class>org.glassfish.jersey.servlet.ServletContainer</servlet-class>
    <init-param>
      <param-name>jersey.config.server.provider.packages</param-name>
      <param-value/>
    </init-param>
    <init-param>
      <param-name>jersey.config.server.resource.validation.ignoreErrors</param-name>
      <param-value>1</param-value>
    </init-param>
    <load-on-startup>-1</load-on-startup>
  </servlet>
  <servlet-mapping>
    <servlet-name>jersey</servlet-name>
    <url-pattern>/jersey/*</url-pattern>
  </servlet-mapping>
</web-app>
```

There is a [caveat](https://docs.spring.io/spring/docs/current/javadoc-api/org/springframework/web/WebApplicationInitializer.html) that the `web.xml` version must be set to "3.0" or higher. Otherwise, the Spring bootstrapping might get ignored.

## Summary

By implementing JEE specification, Application Servers differ vastly from simple Web Servers. Though the configuration is not trivial, It's still possible to convert a Spring Boot application run on an embedded server so that it's compatible with an application server such as WebLogic. The steps that are needed to be taken for such a migration are generally similar regardless of vendors, though the implementation may vary. For example, WildFly has `jboss-deployment-structure.xml` that serves a similar purpose as `weblogic-application.xml` (EAR level equivalent of `weblogic.xml`). More details on this topic can usually be found in the application server documentation under the "Class Loading" section.

The knowledge about class loading and JEE specification should give a good headstart for deploying more complex applications like Spring Cloud if such a requirement arises. By taking advantage of maven profiles, the embedded server configuration can still be kept for cross-testing and compatibility validation.