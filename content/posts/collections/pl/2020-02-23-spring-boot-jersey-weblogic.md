---
title: Spring Boot z Jerseyem na WebLogicu
url: spring-boot-jersey-weblogic
id: 24
tags:
  - jee
  - weblogic
  - spring
author: Damian Terlecki
date: 2020-02-23T20:00:00
---

Wdrażanie aplikacji Spring Boot na serwerze aplikacyjnym Javy Enterprise (np. WebLogic) nie jest zbyt popularną sytuacją. Powody mogą być różne, ale zwykle wszystkie mieszczą się w zakresie wymagań korporacyjnych. Przykładowo klient może już mieć znormalizowany system do tworzenia oprogramowania z narzędziami, do których należy się dostosować. Czy w takim przypadku można uruchomić Spring na serwerze aplikacyjnym? I co ma do tego specyfikacja JAX-RS, której implementację oferuje Java EE? Jak to w ogóle ugryźć? Spójrzmy na temat szerzej na przykładzie Spring Boot 2, WebLogic 12.2.1.3.0 / 12.2.1.4.0 i Jersey 1.x / 2.x.

## Od paczki z wbudowanym serwerem (JAR) do aplikacji internetowej (WAR)

Aplikacje bazujące na Spring Boot bardzo często pakowane są wraz z zagnieżdżonym serwerem internetowym. Dzięki starterom i ich zależnościom proces ten jest praktycznie niezauważalny. Na przykład podstawowy starter sieciowy `spring-boot-starter-web` domyślnie zawiera w sobie `spring-boot-starter-tomcat`, który z kolei wykorzystuje zależność `tomcat-embed-core`. Oczywiście Tomcat nie jest jedyną opcją wyboru wbudowanego serwera WWW. Spring Boot udostępnia również inne startery, takie jak Jetty `spring-boot-starter-jetty` czy Undertow `spring-boot-starter-undertow`.

```xml
&lt;properties&gt;
	&lt;servlet-api.version&gt;3.1.0&lt;/servlet-api.version&gt;
&lt;/properties&gt;
&lt;!-- Standardowa konfiguracja początkowa --&gt;
&lt;dependency&gt;
	&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
	&lt;artifactId&gt;spring-boot-starter-web&lt;/artifactId&gt;
	&lt;exclusions&gt;
		&lt;!-- Wykluczenie Tomcata, jeśli decydujemy się używać innego serwera WWW --&gt;
		&lt;exclusion&gt;
			&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
			&lt;artifactId&gt;spring-boot-starter-tomcat&lt;/artifactId&gt;
		&lt;/exclusion&gt;
	&lt;/exclusions&gt;
&lt;/dependency&gt;
&lt;!-- Na przykład możemy zamiast tego użyć Jetty --&gt;
&lt;dependency&gt;
	&lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
	&lt;artifactId&gt;spring-boot-starter-jetty&lt;/artifactId&gt;
&lt;/dependency&gt;
```

Pierwszym krokiem na drodze do wdrożenia na serwerze aplikacyjnym jest usunięcie wbudowanego serwera WWW z pliku JAR i przejście do pakowania WAR. Dzięki archiwum aplikacji internetowej (WAR) będziemy mogli wdrożyć naszą aplikację nie tylko na serwerze aplikacji (WebLogic), ale także na dedykowanym serwerze WWW (Tomcat). Jest to dość proste i wymaga przejścia z `<packaging>jar</packaging>` na `<packaging>war</packaging>`.

Następnie musimy zmienić zależność startera serwera WWW z domyślnego zakresu `compile` na `provided`. W ten sposób odpowiednie klasy nie zostaną zapakowane do paczki, ponieważ spodziewamy się, że kontener zapewni nam niezbędne zależności w czasie uruchomienia.

```xml
&lt;!-- spring-boot-starter-tomcat podmieniamy wybranym starterem serwera WWW i ustawiamy oczekiwany scope --&gt;
&lt;dependency&gt;
   &lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
   &lt;artifactId&gt;spring-boot-starter-tomcat&lt;/artifactId&gt;
   &lt;scope&gt;provided&lt;/scope&gt;
&lt;/dependency&gt;
```

Ok, ale czy przypadkiem o czymś nie zapomnieliśmy? W przypadku pakowania JAR klasę rozruchową określaliśmy przy pomocy pluginu `spring-boot-maven-plugin`:


```xml
&lt;plugin&gt;
    &lt;groupId&gt;org.springframework.boot&lt;/groupId&gt;
    &lt;artifactId&gt;spring-boot-maven-plugin&lt;/artifactId&gt;
    &lt;configuration&gt;
        &lt;mainClass&gt;com.example.app.Main&lt;/mainClass&gt;
    &lt;/configuration&gt;
&lt;/plugin&gt;
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
&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;
&lt;wls:weblogic-web-app xmlns:wls=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app&quot;
  xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot;
  xsi:schemaLocation=&quot;http://xmlns.oracle.com/weblogic/weblogic-web-app
                      http://xmlns.oracle.com/weblogic/weblogic-web-app/1.8/weblogic-web-app.xsd&quot;&gt;
  &lt;wls:context-root&gt;my-app&lt;/wls:context-root&gt;
&lt;/wls:weblogic-web-app&gt;
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

<img src="data:image/png;base64,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" title="Automatycznie zarejestrowana usługa RESTowa przez WebLogica" alt="Automatycznie zarejestrowana usługa RESTowa przez WebLogica">

Aby to zrobić wystarczy podać wartość parametru `jersey.config.server.provider.packages` (pustą w celu wyłączenia) w `src/main/webapp/WEB-INF/web.xml`. Na przykład:

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
    &lt;load-on-startup&gt;-1&lt;/load-on-startup&gt;
  &lt;/servlet&gt;
  &lt;servlet-mapping&gt;
    &lt;servlet-name&gt;jersey&lt;/servlet-name&gt;
    &lt;url-pattern&gt;/jersey/*&lt;/url-pattern&gt;
  &lt;/servlet-mapping&gt;
&lt;/web-app&gt;
```

## Podsumowanie

Dzięki implementacji specyfikacji JEE, serwery aplikacyjne znacznie różnią się od serwerów WWW typu Tomcat. Chociaż konfiguracja nie jest trywialna, nadal można przekonwertować aplikację Spring Boot uruchamianą na wbudowanym serwerze do aplikacji internetowej kompatybilnej z serwerem aplikacyjnym, takim jak WebLogic. Kroki, które należy podjąć w przypadku takiej migracji, są na ogół podobne, niezależnie od dostawców, choć ich szczegóły (implementacja) może się różnić. Na przykład serwer aplikacyjny WildFly ma `jboss-deployment-structure.xml`, który służy do podobnego celu co `weblogic-application.xml` (odpowiednik `weblogic.xml` na poziomie paczki EAR). Więcej szczegółów na ten temat można zwykle znaleźć w dokumentacji danego serwera w sekcji "Class Loading".

Wiedza na temat ładowania klas na serwerach aplikacyjnych wraz z podstawową znajomością specyfikacji JEE powinny stanowić dobry punkt wyjścia przy wdrażaniu bardziej złożonych aplikacji takich jak Spring Cloud – jeśli pojawi się taki wymóg. Korzystając z profilów Mavenowych, konfigurację z osadzonym serwerem możemy wciąż wykorzystać do celów testów i weryfikacji kompatybilności.