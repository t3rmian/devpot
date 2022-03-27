---
title: JBoss/WildFly EJB Client Logger
url: wildfly-jboss-ejb-client-logger
id: 71
category:
- jee: JEE
tags:
  - wildfly
  - jboss
  - logs
author: Damian Terlecki
date: 2021-07-25T20:00:00
---

<img src="/img/hq/ejb-client-logger.png" alt="EJB CLient Logger" title="EJB CLient Logger">

EJB client libraries of the JBoss/Wildfly server allow you to attach your own logic around EJB method calls.
This feature is exposed through the `org.jboss.ejb.client.EJBClientInterceptor` interface with `handleInvocation()` method
that wraps the invocation process, and `handleInvocationResult()` method that intercepts the marshalling process.

## wildfly-config.xml

Such interceptor can be injected using the *wildfly-config.xml* configuration file located in the classpath root
(usually it will be placed in the *src/<wbr>main/<wbr>resources/<wbr>wildfly-config.xml*),
or in the META-INF folder (*src/<wbr>main/<wbr>resources/<wbr>META-INF/<wbr>wildfly-config.xml*).
Alternatively, the location of the file can be provided via the `wildfly.config.url` Java system parameter.

In the configuration file, we define the full name of the class implementing the interceptor along with its package name:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <jboss-ejb-client xmlns="urn:jboss:wildfly-client-ejb:3.0">
        <global-interceptors>
            <interceptor class="dev.termian.demo.EJBClientLoggingInterceptor"/>
        </global-interceptors>
    </jboss-ejb-client>
</configuration>
```

We can also configure such an interceptor for a specific connection by adding it inside the *jboss-ejb-client* ➜
*connections* ➜ *connection* ➜ *interceptors* element.

## EJBClientInterceptor

All relevant dependencies can be imported through the ***wildfly-ejb-client-bom*** pom dependency. Additionally,
the ***sl4j*** API will be useful for implementing a simple logger. We will also use ***lombok*** to keep our example concise:

```xml

<dependencies>
    <dependency>
        <groupId>org.wildfly</groupId>
        <artifactId>wildfly-ejb-client-bom</artifactId>
        <version>24.0.0.SP1</version>
        <type>pom</type>
    </dependency>

    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-jdk14</artifactId>
        <version>1.7.32</version>
    </dependency>
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>1.7.32</version>
    </dependency>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <version>1.18.20</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

A careful eye will notice that we have imported the ***slf4j-jdk14*** binding, which means that we will use the JUL system logger provided by Java.
You can find the logging configuration in the *jre/lib/logging.properties* file in the JRE installation location. With the
`java.util.logging.config.file` Java system parameter you can also point the system to use your own configuration, e.g. with the logging level set to DEBUG.

When the client invokes EJB methods we can log some useful information like the name of the application the bean comes from,
its name, method, parameters, execution time, and the target server. This can be pretty useful in the analysis of various business and performance problems.

```java
package dev.termian.demo;

import lombok.Builder;
import lombok.Getter;
import lombok.NonNull;
import lombok.ToString;

@Builder
@Getter
@ToString
class EJBClientLog {
    @NonNull
    private final String application;
    @NonNull
    private final String view;
    @NonNull
    private final String method;
    private final Object[] parameterValues;
    @NonNull
    private final String[] parameterTypes;
    private final String weakAffinity;
    @NonNull
    private final String strongAffinity;
    private final String session;
    private final Long executionTimeMs;
    private final Object response;
}
```

The interceptor itself will be quite simple. The invocation and result processing
is done by delegation to the context object. The context then activates another interceptor,
invoking the actual method at the very end of such a chain.

```java
package dev.termian.demo;

import lombok.SneakyThrows;
import org.jboss.ejb.client.Affinity;
import org.jboss.ejb.client.EJBClientInterceptor;
import org.jboss.ejb.client.EJBClientInvocationContext;
import org.jboss.ejb.client.EJBLocator;
import org.jboss.ejb.client.EJBMethodLocator;
import org.jboss.ejb.client.EJBSessionCreationInvocationContext;
import org.jboss.ejb.client.SessionID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.net.URI;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

public class EJBClientLoggingInterceptor implements EJBClientInterceptor {

    private static final Logger LOGGER = LoggerFactory.getLogger(EJBClientInterceptor.class);
    private static final Field START_NANO_TIME_FIELD;

    static {
        try {
            START_NANO_TIME_FIELD = EJBClientInvocationContext.class.getDeclaredField("startTime");
            START_NANO_TIME_FIELD.setAccessible(true);
        } catch (NoSuchFieldException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @Override
    public void handleInvocation(EJBClientInvocationContext context) throws Exception {
        try {
            context.sendRequest();
        } catch (Exception e) {
            logError(context, e);
            throw e;
        }
    }

    @Override
    public Object handleInvocationResult(EJBClientInvocationContext context) throws Exception {
        try {
            Object result = context.getResult();
            if (LOGGER.isDebugEnabled()) {
                logDebug(context, result);
            } else {
                logInfo(context);
            }
            return result;
        } catch (Exception e) {
            logError(context, e);
            throw e;
        }
    }

    @Override
    public SessionID handleSessionCreation(EJBSessionCreationInvocationContext context) throws Exception {
        return EJBClientInterceptor.super.handleSessionCreation(context);
    }

    private void logError(EJBClientInvocationContext context) {
        if (LOGGER.isErrorEnabled()) {
            LOGGER.error(formatMessage(context).response(e).build().toString());
        }
    }

    private void logInfo(EJBClientInvocationContext context) {
        if (LOGGER.isInfoEnabled()) {
            LOGGER.info(formatMessage(context).build().toString());
        }
    }

    private void logDebug(EJBClientInvocationContext context, Object response) {
        if (LOGGER.isDebugEnabled()) {
            LOGGER.debug(formatMessage(context).response(response).build().toString());
        }
    }

    @SneakyThrows
    private EJBClientLog.EJBClientLogBuilder formatMessage(EJBClientInvocationContext context) {
        EJBClientLog.EJBClientLogBuilder log = EJBClientLog.builder();

        EJBLocator<?> ejbLocator = context.getLocator();
        log.application(ejbLocator.getIdentifier().toString());
        log.view(ejbLocator.getViewType().getName());
        log.weakAffinity(getAffinityUri(context.getWeakAffinity()));
        log.strongAffinity(getAffinityUri(ejbLocator.getAffinity()));
        if (ejbLocator.isStateful()) {
            log.session(ejbLocator.asStateful().getSessionId().toString());
        }

        EJBMethodLocator methodLocator = context.getMethodLocator();
        log.method(methodLocator.getMethodName());
        log.parameterValues(context.getParameters());
        log.parameterTypes(IntStream.range(0, methodLocator.getParameterCount())
                .mapToObj(methodLocator::getParameterTypeName)
                .toArray(String[]::new));

        log.executionTimeMs(TimeUnit.MILLISECONDS.convert(System.nanoTime() - START_NANO_TIME_FIELD.getLong(context), TimeUnit.NANOSECONDS));

        return log;
    }

    private String getAffinityUri(Affinity affinity) {
        if (affinity == null) {
            return null;
        }
        URI uri = affinity.getUri();
        if (uri == null) {
            return null;
        }
        return uri.toString();
    }

}
```

Most of the information we need can be obtained from the *EJBClientInvocationContext* object, or rather from its state represented
by the *EJBLocator* and *EJBMethodLocator* type objects.
The context also contains the `startTime` field as a part of its implementation.
Using the reflection mechanism, we can easily calculate the execution time. Keep in mind that this is not the best practice.

It is worth noting that the logging is conditional on the logging level. This way the overhead of creating a custom log message is limited
when the relevant logging level is disabled. Ultimately, such logs could be further associated with the user's session in your system.

Apart from the implementation and configuration of formatting, when invoking the EJB over HTTP, we will see the following logs:
```groovy
Jul 25, 2021 12:13:31 PM dev.termian.demo.EJBClientLoggingInterceptor logDebug
FINE: EJBClientLog(application=/server-1.0-SNAPSHOT/DemoBean, view=demo.DemoService, method=getMyPayload, parameterValues=[PARAM1], parameterTypes=[java.lang.String], weakAffinity=http://172.17.0.2:8081/wildfly-services, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=UUIDSessionID [6013c9fd-d512-4210-93d1-b0e32b7a5cbc], executionTime=72, response=[demo.DemoDto@422dbc02])
Jul 25, 2021 12:13:31 PM dev.termian.demo.EJBClientLoggingInterceptor logDebug
FINE: EJBClientLog(application=/server-1.0-SNAPSHOT/DemoBean, view=demo.DemoService, method=runClient, parameterValues=null, parameterTypes=[], weakAffinity=http://172.17.0.2:8081/wildfly-services, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=UUIDSessionID [6013c9fd-d512-4210-93d1-b0e32b7a5cbc], executionTime=31, response=null)
Jul 25, 2021 1:46:01 PM dev.termian.demo.EJBClientLoggingInterceptor logError
SEVERE: EJBClientLog(application=/server-1.0-SNAPSHOT/StatelessDemoBean, view=demo.StatelessDemoService, method=getMyPayload, parameterValues=[THROW], parameterTypes=[java.lang.String], weakAffinity=null, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=null, executionTimeMs=132, response=java.lang.InterruptedException: Interrupted by user)
```

## Summary

Using the EJB interceptor defined in the *wildfly-config.xml*, we are able to easily add logging of EJB method calls on the WildFly/JBoss client side.
Unfortunately, it's not quite possible to log the lookup methods this way. Such logs, however, could be achieved
by configuring the logging levels of JBoss client libraries (e.g. *org.jboss.ejb.client*).