---
title: Deploying Spring Boot with Jersey on WebLogic
url: spring-boot-jersey-weblogic
id: 24
tags:
  - jee
  - weblogic
  - spring
author: Damian Terlecki
date: 2020-02-23T20:00:00
---

Why would you ever want to have your Spring Boot application deployed on a Java Enterprise Application Server like WebLogic? The reasons may vary but usually, they all go under that scope of some corporate requirements. For example, there already might be a standardized system for software development with tools to which you must adapt. But is it possible to run Spring on an application server? And what's this whole JAX-RS thing that Java EE offers? How do I even bite this? Let's do this in small steps on the example of Spring Boot 2, WebLogic 12.2.1.3.0/12.2.1.4.0 and Jersey 1.x/2.x.

## From an Embedded Web Server (JAR) to a Web Application (WAR)

Spring Boot applications are usually built into jars with embedded web servers. This is done thanks to the starter dependencies. For example, the primary web starter `spring-boot-starter-web` by default includes 'spring-boot-starter-tomcat' which in turn includes `tomcat-embed-core`. Of course, Tomcat is not the only viable option for choosing an embedded web server. Spring Boot also provides other starters like Jetty `spring-boot-starter-jetty` and Undertow `spring-boot-starter-undertow`. 

```xml
&lt;properties&gt;
	&lt;servlet-api.version&gt;3.1.0&lt;/servlet-api.version&gt;
&lt;/properties&gt;
&lt;!-- Usual initial configuration --&gt;
&lt;dependency&gt;
	&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
	&lt;artifactId&gt;spring-boot-starter-web&lt;/artifactId&gt;
	&lt;exclusions&gt;
		&lt;!-- Exclude the Tomcat dependency if you decide to use a different Web Server --&gt;
		&lt;exclusion&gt;
			&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
			&lt;artifactId&gt;spring-boot-starter-tomcat&lt;/artifactId&gt;
		&lt;/exclusion&gt;
	&lt;/exclusions&gt;
&lt;/dependency&gt;
&lt;!-- For an example, you can use Jetty instead --&gt;
&lt;dependency&gt;
	&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
	&lt;artifactId&gt;spring-boot-starter-jetty&lt;/artifactId&gt;
&lt;/dependency&gt;
```

The first step on the road to the Application Server is to remove the embedded web server from the JAR and switch to WAR packaging. With web application archive (WAR) we will be able to deploy our web application not only on an application server (WebLogic) but also on a dedicated web server (Tomcat). This is quite easy and requires switching from `<packaging>jar</packaging>` to `<packaging>war</packaging>`.

Secondly, we have to switch the web server starter dependency from the default `compile` scope to `provided`. This way the relevant classes will not be packaged into the WAR, as we will expect the container to provide necessary dependencies at the runtime.

```xml
&lt;!-- Replace spring-boot-starter-tomcat with chosen web server starter and set the scope to provided --&gt;
&lt;dependency&gt;
   &lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
   &lt;artifactId&gt;spring-boot-starter-tomcat&lt;/artifactId&gt;
   &lt;scope&gt;provided&lt;/scope&gt;
&lt;/dependency&gt;
```

Ok, but aren't we missing something? With the JAR method, we specified the main method for the build package phase in the `spring-boot-maven-plugin`:

```xml
&lt;plugin&gt;
    &lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
    &lt;artifactId&gt;spring-boot-maven-plugin&lt;/artifactId&gt;
    &lt;configuration&gt;
        &lt;mainClass&gt;com.example.app.Main&lt;/mainClass&gt;
    &lt;/configuration&gt;
&lt;/plugin&gt;
```

To load your Spring application configuration in the container environment, we have to set up the starting point equivalent of the main method (which will configure the dispatcher, filters, servlets and listeners). Keep in mind that this configuration is for Servlet API 3.1+ (Spring Boot 2 + WLS 12.2.1). For legacy versions, [spring-boot-legacy](https://github.com/dsyer/spring-boot-legacy) might be helpful.

Back to the topic – we have to extend `SpringBootServletInitializer` and provide our configuration sources. What's more, **we need to implement `WebApplicationInitializer` again**, even though the `SpringBootServletInitializer` already implements it. Otherwise, WebLogic does not pick up this class (if you're curious, how this mechanism works – check out [SpringServletContainerInitializer javadocs](https://docs.spring.io/spring/docs/current/javadoc-api/org/springframework/web/SpringServletContainerInitializer.html)).

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
&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;
&lt;wls:weblogic-web-app xmlns:wls=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app&quot;
        xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot;
        xsi:schemaLocation=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.0/weblogic-web-app.xsd&quot;&gt;

    &lt;wls:container-descriptor&gt;
        &lt;wls:prefer-application-packages&gt;
            &lt;!-- jsr311 --&gt;
            &lt;wls:package-name&gt;javax.ws.rs.*&lt;/wls:package-name&gt;
            &lt;!-- javassist --&gt;
            &lt;wls:package-name&gt;javassist.*&lt;/wls:package-name&gt;
            &lt;!-- aop repackaged --&gt;
            &lt;wls:package-name&gt;org.aopalliance.*&lt;/wls:package-name&gt;

            &lt;!-- jersey 2 --&gt;
            &lt;wls:package-name&gt;jersey.repackaged.*&lt;/wls:package-name&gt;
            &lt;wls:package-name&gt;org.glassfish.jersey.*&lt;/wls:package-name&gt;
            &lt;wls:package-name&gt;com.sun.research.ws.wadl.*&lt;/wls:package-name&gt;

            &lt;!-- hk2 --&gt;
            &lt;wls:package-name&gt;org.glassfish.hk2.*&lt;/wls:package-name&gt;
            &lt;wls:package-name&gt;org.jvnet.hk2.*&lt;/wls:package-name&gt;
            &lt;wls:package-name&gt;org.jvnet.tiger_types.*&lt;/wls:package-name&gt;
        &lt;/wls:prefer-application-packages&gt;

        &lt;wls:prefer-application-resources&gt;
            &lt;wls:resource-name&gt;META-INF/services/javax.servlet.ServletContainerInitializer&lt;/wls:resource-name&gt;
            &lt;wls:resource-name&gt;META-INF/services/javax.ws.rs.ext.RuntimeDelegate&lt;/wls:resource-name&gt;

            &lt;!-- jersey --&gt;
            &lt;wls:resource-name&gt;META-INF/services/org.glassfish.jersey.*&lt;/wls:resource-name&gt;
            &lt;wls:resource-name&gt;org.glassfish.jersey.*&lt;/wls:resource-name&gt;
            &lt;wls:resource-name&gt;jersey.repackaged.*&lt;/wls:resource-name&gt;

            &lt;!-- hk2 --&gt;
            &lt;wls:resource-name&gt;META-INF/services/org.glassfish.hk2.*&lt;/wls:resource-name&gt;
        &lt;/wls:prefer-application-resources&gt;
    &lt;/wls:container-descriptor&gt;

&lt;/wls:weblogic-web-app&gt;
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
&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;
&lt;wls:weblogic-web-app xmlns:wls=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app&quot;
  xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot;
  xsi:schemaLocation=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app
                      http://xmlns.oracle.com/weblogic/weblogic-web-app/1.8/weblogic-web-app.xsd&quot;&gt;
  &lt;wls:context-root&gt;my-app&lt;/wls:context-root&gt;
&lt;/wls:weblogic-web-app&gt;
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

#### Default Jersey scanning

JAX-RS application resources can still be scanned by the WebLogic. This would be unfeasible if you're registering the servlet containers explicitly and programmatically in Spring Boot through `ServletRegistrationBean`. You might want to not have some or any of the resources scanned (or change the default mapping). 

<img src="data:image/png;base64,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" title="Automatically registered REST Service by WebLogic" alt="Automatically registered REST Service by WebLogic">

To do this, just provide a parameter value (empty to disable) for `jersey.config.server.provider.packages` in `src/main/webapp/WEB-INF/web.xml` like so:

```xml
&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;
&lt;web-app xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot;
  xmlns=&quot;http://java.sun.com/xml/ns/javaee&quot;
  xsi:schemaLocation=&quot;http://java.sun.com/xml/ns/javaee http://java.sun.com/xml/ns/javaee/web-app_2_5.xsd&quot;
  version=&quot;2.5&quot; metadata-complete=&quot;true&quot;&gt;
  &lt;servlet&gt;
    &lt;servlet-name&gt;jersey&lt;/servlet-name&gt;
    &lt;servlet-class&gt;org.glassfish.jersey.servlet.ServletContainer&lt;/servlet-class&gt;
    &lt;init-param&gt;
      &lt;param-name&gt;jersey.config.server.provider.packages&lt;/param-name&gt;
      &lt;param-value/&gt;
    &lt;/init-param&gt;
    &lt;init-param&gt;
      &lt;param-name&gt;jersey.config.server.resource.validation.ignoreErrors&lt;/param-name&gt;
      &lt;param-value&gt;1&lt;/param-value&gt;
    &lt;/init-param&gt;
    &lt;load-on-startup&gt;1&lt;/load-on-startup&gt;
  &lt;/servlet&gt;
  &lt;servlet-mapping&gt;
    &lt;servlet-name&gt;jersey&lt;/servlet-name&gt;
    &lt;url-pattern&gt;/jersey/*&lt;/url-pattern&gt;
  &lt;/servlet-mapping&gt;
&lt;/web-app&gt;
```

## Summary

By implementing JEE specification, Application Servers differ vastly from simple Web Servers. Though the configuration is not trivial, It's still possible to convert a Spring Boot application run on an embedded server so that it's compatible with an application server such as WebLogic. The steps that are needed to be taken for such a migration are generally similar regardless of vendors, though the implementation may vary. For example, WildFly has `jboss-deployment-structure.xml` that serves a similar purpose as `weblogic-application.xml` (EAR level equivalent of `weblogic.xml`). More details on this topic can usually be found in the application server documentation under the "Class Loading" section.

The knowledge about class loading and JEE specification should give a good headstart for deploying more complex applications like Spring Cloud if such a requirement arises. By taking advantage of maven profiles, the embedded server configuration can still be kept for cross-testing and compatibility validation.