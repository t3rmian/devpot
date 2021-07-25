---
title: JBoss/Wildfly EJB Client Logger
url: wildfly-jboss-ejb-client-logger
id: 71
tags:
  - java
author: Damian Terlecki
date: 2021-07-25T20:00:00
---

<img src="/img/hq/ejb-client-logger.png" alt="EJB CLient Logger" title="EJB CLient Logger">

Biblioteki klienckie do serwera JBoss/Wildfly dają możliwość podpięcie własnej logiki wokół wywoływań metod EJB.
Wystarczy, że zaimplementujemy interfejs `org.jboss.ejb.client.EJBClientInterceptor` z metodą `handleInvocation()` wysyłającą zapytanie 
oraz z metodą `handleInvocationResult()`, która to przetwarza (marshall) rezultat zapytania.

## wildfly-config.xml

Interceptor podpinamy za pomocą pliku konfiguracyjnego *wildfly-config.xml*, umieszczonego w korzeniu classpath
(zazwyczaj będzie to *src/<wbr>main/<wbr>resources/<wbr>wildfly-config.xml*), bądź w folderze META-INF (*src/<wbr>main/<wbr>resources/<wbr>META-INF/<wbr>wildfly-config.xml*).
Alternatywnie, umiejscowienie pliku wprowadzić możemy poprzez parametr systemowy Javy `wildfly.config.url`.

W pliku konfiguracyjnym podajemy pełną nazwę klasy implementującej interceptor wraz z nazwą pakietu:

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

Taki interceptor możemy również skonfigurować dla specyficznego połączenia, dodając go wewnątrz elementu *jboss-ejb-client* ➜
*connections* ➜ *connection* ➜ *interceptors*.

## EJBClientInterceptor

Do naszego przykładu potrzebować będziemy przede wszystkim bibliotek klienckich ***wildfly-ejb-client-bom***. Dodatkowo
przyda się API ***sl4j*** do implementacji prostego loggera, a także ***lombok***, aby nie rozpisywać się w naszym przykładzie:

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

Uważne oko wyłapie, że zaimportowaliśmy wiązanie ***slf4j-jdk14***, co oznacza, że skorzystamy z loggera systemowego JUL oferowanego przez Javę.
Konfigurację logowania znajdziesz w pliku *jre/lib/logging.properties* w miejscu instalacji JRE. Za pomocą parametru systemowego Javy
`java.util.logging.config.file` podepniesz również projektową konfigurację loggera, np. z ustawionym poziomem logowania na DEBUG.

Informacje, do których mamy dostęp podczas wywoływania metod przez klienta to między innymi nazwa aplikacji, z której pochodzi
ziarno, nazwa ziarna, metoda, parametry, czas wykonania oraz serwer docelowy. Takie dane przydają się podczas wstępnej analizy różnego rodzaju problemów
biznesowych, jak i wydajnościowych.

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

Sam interceptor będzie zasadniczo prosty. Wywołanie procesu wysłania zapytania i przeprocesowania
odbywa się poprzez oddelegowanie do obiektu kontekstu. Kontekst następnie aktywuje kolejny interceptor,
wywołując właściwą metodę na sam koniec takiego łańcucha.

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

Większość potrzebnych nam informacji wyciągniemy z obiektu *EJBClientInvocationContext*, a właściwie z jego stanu reprezentowanego przez 
obiekty typu *EJBLocator* oraz *EJBMethodLocator*. Sam kontekst wywołania w swojej implementacji zapisuje czas rozpoczęcia inwokacji w polu
`startTime`. Nie jest to najlepsza praktyka, ale z pomocą mechanizmu refleksji możemy w prosty sposób wyliczyć czas wywołania i przetwarzania rezultatu
odpowiedzi.

Warto zauważyć, że logowanie następuje warunkowo w zależności od poziomu logowania. Dzięki temu narzut związany z tworzeniem niestandardowego
obiektu wiadomości jest pomijany przy ustawieniu wyższego poziomu logowania. Ostatecznie takie logowanie moglibyśmy dalej powiązać z sesją użytkownika
właściwą dla wybranego szkieletu aplikacji.

Pomijając implementację i konfigurację formatowania, przy komunikacji za pomocą protokołu HTTP logi klienta EJB będą prezentować się w następujący sposób:
```groovy
Jul 25, 2021 12:13:31 PM dev.termian.demo.EJBClientLoggingInterceptor logDebug
FINE: EJBClientLog(application=/server-1.0-SNAPSHOT/DemoBean, view=demo.DemoService, method=getMyPayload, parameterValues=[PARAM1], parameterTypes=[java.lang.String], weakAffinity=http://172.17.0.2:8081/wildfly-services, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=UUIDSessionID [6013c9fd-d512-4210-93d1-b0e32b7a5cbc], executionTime=72, response=[demo.DemoDto@422dbc02])
Jul 25, 2021 12:13:31 PM dev.termian.demo.EJBClientLoggingInterceptor logDebug
FINE: EJBClientLog(application=/server-1.0-SNAPSHOT/DemoBean, view=demo.DemoService, method=runClient, parameterValues=null, parameterTypes=[], weakAffinity=http://172.17.0.2:8081/wildfly-services, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=UUIDSessionID [6013c9fd-d512-4210-93d1-b0e32b7a5cbc], executionTime=31, response=null)
Jul 25, 2021 1:46:01 PM dev.termian.demo.EJBClientLoggingInterceptor logError
SEVERE: EJBClientLog(application=/server-1.0-SNAPSHOT/StatelessDemoBean, view=demo.StatelessDemoService, method=getMyPayload, parameterValues=[THROW], parameterTypes=[java.lang.String], weakAffinity=null, strongAffinity=http://172.17.0.2:8081/wildfly-services, session=null, executionTimeMs=132, response=java.lang.InterruptedException: Interrupted by user)
```

## Podsumowanie

Za pomocą interceptora EJB zdefiniowanego w pliku konfiguracyjnym *wildfly-config.xml*, jesteśmy w stanie w prosty sposób dodać logowanie wywołań metod EJB po stronie klienta Wildfly/JBoss.
Niestety tym sposobem nie przechwycimy samego procesu lokalizacji ziarna. Dokładniejsze, choć już nie tak dopasowane logi otrzymamy, 
konfigurując poziomy logowania loggerów wewnątrz bibliotek klienckich JBossa (np. *org.jboss.ejb.client*).