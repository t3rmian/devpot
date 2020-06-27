---
title: Spring Boot z Jerseyem na WebLogicu
url: spring-boot-jersey-weblogic
id: 24
tags:
  - jee
  - weblogic
  - spring
  - classloading
author: Damian Terlecki
date: 2020-02-23T20:00:00
---

Wdrażanie aplikacji Spring Boot na serwerze aplikacyjnym Javy Enterprise (np. WebLogic) nie jest zbyt popularną sytuacją. Powody mogą być różne, ale zwykle wszystkie mieszczą się w zakresie wymagań korporacyjnych. Przykładowo klient może już mieć znormalizowany system do tworzenia oprogramowania z narzędziami, do których należy się dostosować. Czy w takim przypadku można uruchomić Spring na serwerze aplikacyjnym? I co ma do tego specyfikacja JAX-RS, której implementację oferuje Java EE? Jak to w ogóle ugryźć? Spójrzmy na temat szerzej na przykładzie Spring Boot 2, WebLogic 12.2.1.3.0 / 12.2.1.4.0 i Jersey 1.x / 2.x.

## Od paczki z wbudowanym serwerem (JAR) do aplikacji internetowej (WAR)

Aplikacje bazujące na Spring Boot bardzo często pakowane są wraz z zagnieżdżonym serwerem internetowym. Dzięki starterom i ich zależnościom proces ten jest praktycznie niezauważalny. Na przykład podstawowy starter sieciowy `spring-boot-starter-web` domyślnie zawiera w sobie `spring-boot-starter-tomcat`, który z kolei wykorzystuje zależność `tomcat-embed-core`. Oczywiście Tomcat nie jest jedyną opcją wyboru wbudowanego serwera WWW. Spring Boot udostępnia również inne startery, takie jak Jetty `spring-boot-starter-jetty` czy Undertow `spring-boot-starter-undertow`.

```xml
<properties>
	<servlet-api.version>3.1.0</servlet-api.version>
</properties>
<!-- Standardowa konfiguracja początkowa -->
<dependency>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-web</artifactId>
	<exclusions>
		<!-- Wykluczenie Tomcata, jeśli decydujemy się używać innego serwera WWW -->
		<exclusion>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-tomcat</artifactId>
		</exclusion>
	</exclusions>
</dependency>
<!-- Na przykład możemy zamiast tego użyć Jetty -->
<dependency>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

Pierwszym krokiem na drodze do wdrożenia na serwerze aplikacyjnym jest usunięcie wbudowanego serwera WWW z pliku JAR i przejście do pakowania WAR. Dzięki archiwum aplikacji internetowej (WAR) będziemy mogli wdrożyć naszą aplikację nie tylko na serwerze aplikacji (WebLogic), ale także na dedykowanym serwerze WWW (Tomcat). Jest to dość proste i wymaga przejścia z `<packaging>jar</packaging>` na `<packaging>war</packaging>`.

Następnie musimy zmienić zależność startera serwera WWW z domyślnego zakresu `compile` na `provided`. W ten sposób odpowiednie klasy nie zostaną zapakowane do paczki, ponieważ spodziewamy się, że kontener zapewni nam niezbędne zależności w czasie uruchomienia.

```xml
<!-- spring-boot-starter-tomcat podmieniamy wybranym starterem serwera WWW i ustawiamy oczekiwany scope -->
<dependency>
   <groupId>org.springframework.boot</groupId>
   <artifactId>spring-boot-starter-tomcat</artifactId>
   <scope>provided</scope>
</dependency>
```

Ok, ale czy przypadkiem o czymś nie zapomnieliśmy? W przypadku pakowania JAR klasę rozruchową określaliśmy przy pomocy pluginu `spring-boot-maven-plugin`:


```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <mainClass>com.example.app.Main</mainClass>
    </configuration>
</plugin>
```

Aby załadować konfigurację Springową (dispatcher, filtry, serwlety, listenery) w środowisku serwletowym, musimy skonfigurować nasz punkt wejściowy na wzór metody `main`. Należy pamiętać, że omawiany tu przypadek dotyczy API Serwletowego 3.1+ (Spring Boot 2 + WLS 12.2.1). W przypadku starszych wersji pomocne może być repozytorium [spring-boot-legacy](https://github.com/dsyer/spring-boot-legacy).

Wracając do tematu – najprostszym rozwiązaniem będzie rozszerzenie klasy `SpringBootServletInitializer` wraz z podaniem źródeł naszej konfiguracji. W przypadku WebLogica (w zależności od wersji) konieczne może być ponowne zaimplementowanie interfejsu `WebApplicationInitializer` mimo tego, że zostało to już zrobione w klasie `SpringBootServletInitializer`. W przeciwnym razie WebLogic nie znajdzie naszej klasy podczas skanowania. Problem ten został poprawiony dopiero w jednej z nowszych wersji 12.1.3 (patch 16769849). Jeśli interesuje Cię, jak działa mechanizm inicjalizacji – zajrzyj do [javadoców klasy SpringServletContainerInitializer](https://docs.spring.io/spring/docs/current/javadoc-api/org/springframework/web/SpringServletContainerInitializer.html).

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

Co ciekawe `spring-boot-maven-plugin` zajmie się także spakowaniem WAR-a, więc nie musimy jawnie konfigurować `maven-war-plugin`.

## Jersey na WebLogicu

Serwery aplikacyjne muszą być zgodne ze [specyfikacją JEE](https://javaee.github.io/javaee-spec/). Ponieważ wersja 12.2.1 jest zgodna ze specyfikacją JEE7, WebLogic zapewnia implementację JAX-RS 2.0 RI (Jersey 2.x). Wsparcie to wymaga zarejestrowania biblioteki współdzielonej. Wersja 12.2.1.3.0 zapewnia już taką implementację domyślnie. API serwerowe dla Jersey 1.x nie są już wspierane, ale pakiety klienckie są nadal dostępne, choć zaznaczone jako 'deprecated' (co oznacza, że mogą zostać wycofane w kolejnych wersjach) w celu zapewnienia zgodności z poprzednimi wersjami. Jak można się domyślić, różne wersje serwerów aplikacyjnych komplikują nieco proces tworzenia naszej aplikacji.

W przypadku WebLogica i innych serwerów aplikacyjnych mamy zasadniczo dwie opcje. Albo dostosujemy się do bibliotek dostarczonych przez daną wersję kontenera, albo będziemy musieli dostarczyć je wraz z aplikacją i odpowiednio skonfigurować ich ładowanie. Pierwszy wybór to dobre rozwiązanie, gdy aplikację budujemy od zera. Druga opcja jest natomiast o wiele mniej bolesna, gdy nasz projekt korzysta już z zestawu zdefiniowanych i zweryfikowanych bibliotek.

Aby to skonfigurować preferowanie bibliotek dostarczonych razem z aplikacją, należy dodać plik konfiguracyjny w `src/main/webapp/WEB-INF/weblogic.xml`. Przykładowa konfiguracja, w której preferowane są biblioteki Jerseyowe, może wyglądać [następująco](https://github.com/jersey/jersey/blob/faa809da43538ce31076b50f969b4bd64caa5ac9/tests/mem-leaks/test-cases/bean-param-leak/src/main/webapp/WEB-INF/weblogic.xml):

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

Ale aby poprawnie zdefiniować, które biblioteki powinny być preferowane w naszym przypadku, najpierw należy przeprowadzić pewną analizę, w przeciwnym razie jesteśmy podatni na błędy, takie jak `java.lang.LinkageError`, `java.lang.NoClassDefFoundError` i `java.lang.ClassNotFoundException`. Musimy dowiedzieć się, które pakiety są dostarczane przez serwer aplikacji i które pochodzą z naszą aplikacją. Aby wykryć i rozwiązać takie konflikty, Oracle zapewnia narzędzie **Classloader Analysis Tool (CAT)**. W formie aplikacji internetowej zwykle znajduje się w `%WL_HOME%/wlserver/server/lib/wls-cat.war`. Domyślnie może też być wdrożona pod adresem [localhost:port/wls-cat](http://localhost:7001/wls-cat). Warto jest więc to sprawdzić przed ręczną jej instalacją. Świetnym odniesieniem do korzystania z tej aplikacji wraz ze wskazówkami dotyczącymi rozwiązywania konfliktów jest [przewodnik na blogu Syscon Middleware](https://blog.sysco.no/class/loader/AnalysingClassLoadingConflicts/).

Nieco trudnym może okazać się właściwe ustawienie preferowanych zasobów aplikacji. Ścieżka `/META-INF/services/` jest bowiem generalnie używana do definiowania [dostawców usług](https://docs.oracle.com/javase/8/docs/api/java/util/ServiceLoader.html). Typowy błąd powiązany z tym problemem zawiera informacje o tym, że nie znaleziono implementacji dostawcy:

> **weblogic.application.ModuleException**: org.glassfish.jersey.internal.ServiceConfigurationError: org.glassfish.jersey.server.spi.ComponentProvider: **The class** org.glassfish.jersey.ext.cdi1x.internal.CdiComponentProvider **implementing the provider interface** org.glassfish.jersey.server.spi.ComponentProvider **is not found**. The provider implementation is ignored.:org.glassfish.jersey.internal.ServiceConfigurationError:org.glassfish.jersey.server.spi.ComponentProvider: The class org.glassfish.jersey.ext.cdi1x.internal.CdiComponentProvider implementing the provider interface org.glassfish.jersey.server.spi.ComponentProvider is not found. The provider implementation is ignored.</br>
>	at org.glassfish.jersey.internal.ServiceFinder.fail(ServiceFinder.java:433)</br>
>	at org.glassfish.jersey.internal.ServiceFinder.access$300(ServiceFinder.java:155)</br>
>	at org.glassfish.jersey.internal.ServiceFinder$LazyObjectIterator.handleClassNotFoundException(ServiceFinder.java:806)</br>
>	at org.glassfish.jersey.internal.ServiceFinder$LazyObjectIterator.hasNext(ServiceFinder.java:757)</br>
>	at org.glassfish.jersey.server.ApplicationHandler.getRankedComponentProviders(ApplicationHandler.java:743)</br>
>	Truncated. see log file for complete stacktrace

## Spring

Podczas wdrażania aplikacji Springowej na serwer aplikacyjny, im więcej zależności potrzebuje nasza aplikacja (np. JPA/Bean), tym więcej konfliktów będziemy musieli potencjalnie rozwiązać. Warto pamiętać o tym podczas dewelopmentu, jeśli naszym celem jest np. WebLogic. Na koniec, jeśli chcesz skonfigurować ścieżkę kontekstową aplikacji Spring Boot wdrożonej w WebLogic, możesz to zrobić, używając wspomnianego wcześniej pliku konfiguracyjnego `weblogic.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<wls:weblogic-web-app xmlns:wls="http://xmlns.oracle.com/weblogic/weblogic-web-app"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                      http://xmlns.oracle.com/weblogic/weblogic-web-app/1.8/weblogic-web-app.xsd">
  <wls:context-root>my-app</wls:context-root>
</wls:weblogic-web-app>
```

Wartość ta zastąpi parametr `server.servlet.context-path` z konfiguracji `src/main/resources/application.yml` i aplikacja będzie miała prawidłową ścieżkę na WebLogicu.

## Inne smaczki

Jest jeszcze kilka problemów, na które możesz napotkać lub nie. Wiedza o nich pozwoli ci zaoszczędzić trochę czasu na poszukiwaniu rozwiązań.

#### ProxyCtl

W przypadku migracji złożonej aplikacji REST-owej Spring Boot opartej na Jerseyu możesz natknąć się na następujący błąd:

> java.lang.IllegalArgumentException: interface org.glassfish.hk2.api.ProxyCtl is not visible from class loader

W takim przypadku dobrym pomysłem jest sprawdzenie, czy przypadkiem nie wstrzykujemy gdzieś `@Context HttpServletRequest` w filtrach bądź zasobach. Jest to jeden z popularnych problemów [podczas używania Jerseya na WebLogicu](https://github.com/jersey/jersey/issues/3422). Jednym z obejść tego problemu jest pobranie `HttpServletRequest` z opakowanych w `ThreadLocal` parametrów `RequestContextHolder`:

```java
((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
```

#### Automatycznie zarejestrowany Jersey

Zasoby aplikacji JAX-RS mogą być nadal poddawane skanowaniu przez WebLogic. Jeśli rejestrujemy kontenery serwletów jawnie i programowo w Spring Boot za pośrednictwem `ServletRegistrationBean` taka sytuacja może nie być dla nas na rękę. Możemy nie chcieć skanować wybranych zasobów bądź żadnego z nich (bądź chcemy mieć dostęp do domyślnej ścieżki `/resources/*`).

<img src="/img/hq/weblogic-jersey-automatically-registered.png" title="Automatycznie zarejestrowana usługa RESTowa przez WebLogica" alt="Automatycznie zarejestrowana usługa RESTowa przez WebLogica">

Aby to zrobić wystarczy podać wartość parametru `jersey.config.server.provider.packages` (pustą w celu wyłączenia) w `src/main/webapp/WEB-INF/web.xml`. Na przykład:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="http://java.sun.com/xml/ns/javaee"
  xsi:schemaLocation="http://java.sun.com/xml/ns/javaee http://java.sun.com/xml/ns/javaee/web-app_2_5.xsd"
  version="2.5" metadata-complete="true">
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

Warto zaznaczyć, że wersja `web.xml` [musi być ustawiona](https://javadoc.io/doc/org.springframework/spring-web/5.2.4.RELEASE/org/springframework/web/WebApplicationInitializer.html) na "3.0" bądź wyżej. W przeciwnym razie Springowy mechanizm ładowania może zostać zignorowany.

## Podsumowanie

Dzięki implementacji specyfikacji JEE, serwery aplikacyjne znacznie różnią się od serwerów WWW typu Tomcat. Chociaż konfiguracja nie jest trywialna, nadal można przekonwertować aplikację Spring Boot uruchamianą na wbudowanym serwerze do aplikacji internetowej kompatybilnej z serwerem aplikacyjnym, takim jak WebLogic. Kroki, które należy podjąć w przypadku takiej migracji, są na ogół podobne, niezależnie od dostawców, choć ich szczegóły (implementacja) może się różnić. Na przykład serwer aplikacyjny WildFly ma `jboss-deployment-structure.xml`, który służy do podobnego celu co `weblogic-application.xml` (odpowiednik `weblogic.xml` na poziomie paczki EAR). Więcej szczegółów na ten temat można zwykle znaleźć w dokumentacji danego serwera w sekcji "Class Loading".

Wiedza na temat ładowania klas na serwerach aplikacyjnych wraz z podstawową znajomością specyfikacji JEE powinny stanowić dobry punkt wyjścia przy wdrażaniu bardziej złożonych aplikacji takich jak Spring Cloud – jeśli pojawi się taki wymóg. Korzystając z profilów Mavenowych, konfigurację z osadzonym serwerem możemy wciąż wykorzystać do celów testów i weryfikacji kompatybilności.