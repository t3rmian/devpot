---
title: Testy integracyjne z Arquillianem na WebLogicu
url: arquillian-weblogic
id: 30
tags:
  - java
  - weblogic
  - testy
  - intellij
author: Damian Terlecki
date: 2020-05-17T20:00:00
---

Konfiguracja i pierwsze testy w Arquillianie mogą zająć znacznie więcej czasu niż w przypadku Spring Boot. Niemniej jednak czasami musimy wykorzystać to, co mamy w zasięgu ręki (w przypadku Javy EE). Przyjrzyjmy się, jak wygląda podstawowa konfiguracja takich testów na przykładzie WebLogica 12.2, który jest serwerem aplikacji JEE 7. Jest to wersja towarzysząca nam już ponad 5 lat (wersja 14.1 z obsługą Java EE 8 została właśnie wydana w marcu!).

Pierwszą rzeczą, którą musimy wiedzieć w odniesieniu do WebLogica 12.2, jest to, że nie jest on w pełni kompatybilny z obecną wersją Arquilliana. Najnowsze zależności będą działać poprawnie z niższą wersją – 12.1. W pewnym stopniu możemy jednak użyć wersji 12.1 do uruchomienia naszych testów, jak również do połączenia ze zdalnym kontenerem w wersji 12.2.

## Zależności

Do naszej konfiguracji użyjemy Mavena, który jest prawdopodobnie najpopularniejszym narzędzie do budowania projektów w przypadku Javy EE.
Na początek potrzebować będziemy zależności do zintegrowania naszych testów Arquillianowych z JUnitem 4:
```xml
&lt;dependency&gt;
  &lt;groupId&gt;org.jboss.arquillian.junit&lt;/groupId&gt;
  &lt;artifactId&gt;arquillian-junit-container&lt;/artifactId&gt;
  &lt;scope&gt;test&lt;/scope&gt;
&lt;/dependency&gt;
```

Następnie musimy wybrać, z jakiego rodzaju kontenera (a właściwie połączenia) skorzystamy:
- kontener osadzony – działa w tej samej maszynie JVM (nie jest preferowany, może działać niespójnie, wymaga czasu na uruchomienie);
- kontener zarządzany – jest podobny do kontenera zdalnego, ale cyklem jego życia zarządza sam Arquillian;
- kontener zdalny – znajduje się w oddzielnej maszynie JVM.

```xml
&lt;dependency&gt;
  &lt;groupId&gt;org.jboss.arquillian.container&lt;/groupId&gt;
&lt;!--  &lt;artifactId&gt;arquillian-wls-embedded-12.1&lt;/artifactId&gt;--&gt;
&lt;!--  &lt;artifactId&gt;arquillian-wls-managed-12.1&lt;/artifactId&gt;--&gt;
  &lt;artifactId&gt;arquillian-wls-remote-12.1&lt;/artifactId&gt;
  &lt;version&gt;1.0.1.Final&lt;/version&gt;
  &lt;scope&gt;test&lt;/scope&gt;
&lt;/dependency&gt;
```

## Kontener osadzony

Warto nadmienić, że w trybie osadzonym prędzej czy później napotkamy problemy, które nie będą pojawiały się w dwóch pozostałych przypadkach. Jeśli masz zamiar przetestować coś bardziej złożonego, powinieneś wiedzieć o [ryzyku związanym z osadzonymi kontenerami](http://arquillian.org/blog/2012/04/13/the-danger-of-embedded-containers/).

### Maven

Jeśli chcesz wykorzystać kontener w trybie osadzonym, musimy go obligatoryjnie dołączyć do ścieżki classpath. Można tego dokonać za pomocą właściwości `additionalClasspathElements` w konfiguracji wtyczki mavenowej *surefire* (testy jednostkowe) lub wtyczki *failsafe* (testy integracyjne). Samą wtyczkę standardowo umieszczamy w sekcji `&lt;build&gt` wewnątrz `&lt;plugins&gt`.

```xml
&lt;plugin&gt;
  &lt;groupId&gt;org.apache.maven.plugins&lt;/groupId&gt;
  &lt;artifactId&gt;maven-failsafe-plugin&lt;/artifactId&gt;
  &lt;version&gt;2.17&lt;/version&gt;
  &lt;executions&gt;
    &lt;execution&gt;
      &lt;goals&gt;
        &lt;goal&gt;integration-test&lt;/goal&gt;
      &lt;/goals&gt;
    &lt;/execution&gt;
  &lt;/executions&gt;
  &lt;configuration&gt;
    &lt;skip&gt;false&lt;/skip&gt;
    &lt;!-- Disable assertions otherwise an assertionerror involving the WLS management runtime is thrown --&gt;
    &lt;enableAssertions&gt;false&lt;/enableAssertions&gt;
    &lt;classpathDependencyExcludes&gt;
      &lt;classpathDependencyExcludes&gt;javax:javaee-api&lt;/classpathDependencyExcludes&gt;
    &lt;/classpathDependencyExcludes&gt;
    &lt;additionalClasspathElements&gt;
      &lt;!-- This requires setting WL_HOME environment variable e.g.: C:/Ora/wlserver/ --&gt;
      &lt;additionalClasspathElement&gt;${env.WL_HOME}/server/lib/weblogic.jar&lt;/additionalClasspathElement&gt;
    &lt;/additionalClasspathElements&gt;
  &lt;/configuration&gt;
&lt;/plugin&gt;
```

Przy powyższej konfiguracji testy integracyjne możemy uruchomić za pomocą polecenia `mvn verify`.

### IntelliJ

Możliwość uruchamiania testów z poziomu IDE jest bardzo przydatna. W tym przypadku IntelliJ zapewnia świetne wsparcie również dla kontenera wbudowanego.
Wszystko, co musimy zrobić, to dodać konfigurację uruchomieniową. Wybieramy Arquillian JUnit, a w menu konfiguracji kontenerów wybieramy tryb osadzony.

<figure style="text-align: center;">
<img loading="lazy" style="display: inline; margin-bottom: 0;" src="/img/hq/arquillian-intellij-configuration.png" alt="Arquillian test run configuration" title="Arquillian test run configuration">
<img loading="lazy" style="display: inline; margin-bottom: 0;" src="/img/hq/arquillian-intellij-configure.png" alt="Arquillian container configuration" title="Arquillian container configuration">
<img loading="lazy" style="margin-top: 0;" src="/img/hq/arquillian-intellij-container.png" alt="Adding Arquillian container" title="Adding Arquillian container">
</figure>

Teraz jednym kliknięciem (`CTRL+SHIFT+F10`) powinniśmy być w stanie wywołać wybrany test.

## Kontenery zarządzane i zdalne

Konfiguracja połączenia z kontenerem w trybie zarządzanym bądź zdalnym odbywa się poprzez plik `src/test/resources/arquillian.xml`. Przykładowa struktura pliku z opcjonalną zmienną środowiskową `WL_HOME` wskazującą na wersję 12.1:

```xml
&lt;?xml version=&quot;1.0&quot;?&gt;
&lt;arquillian xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot; xmlns=&quot;http://jboss.org/schema/arquillian&quot;
  xsi:schemaLocation=&quot;http://jboss.org/schema/arquillian http://jboss.org/schema/arquillian/arquillian_1_0.xsd&quot;&gt;

  &lt;engine&gt;
    &lt;property name=&quot;deploymentExportPath&quot;&gt;target/&lt;/property&gt;
  &lt;/engine&gt;

  &lt;container qualifier=&quot;wls-managed&quot;&gt;
    &lt;configuration&gt;
      &lt;!-- element opcjonalny jeśli zmienna środowiskowa WL_HOME jest ustawiona --&gt;
      &lt;property name=&quot;wlHome&quot;&gt;C:/Ora/wlserver&lt;/property&gt;
      &lt;!-- ścieżka do domeny --&gt;
      &lt;property name=&quot;domainDirectory&quot;&gt;C:/Ora/wlserver/user_projects/domains/base_domain/&lt;/property&gt;
      &lt;property name=&quot;adminUrl&quot;&gt;t3://localhost:7001&lt;/property&gt;
      &lt;property name=&quot;adminUserName&quot;&gt;weblogic&lt;/property&gt;
      &lt;property name=&quot;adminPassword&quot;&gt;weblogic12#&lt;/property&gt;
      &lt;property name=&quot;target&quot;&gt;AdminServer&lt;/property&gt;
    &lt;/configuration&gt;
  &lt;/container&gt;

  &lt;container qualifier=&quot;wls-remote&quot; default=&quot;true&quot;&gt;
    &lt;configuration&gt;
      &lt;!-- element opcjonalny jeśli zmienna środowiskowa WL_HOME jest ustawiona --&gt;
      &lt;property name=&quot;wlHome&quot;&gt;C:/Ora/wlserver&lt;/property&gt;
      &lt;property name=&quot;adminUrl&quot;&gt;t3://localhost:7001&lt;/property&gt;
      &lt;property name=&quot;adminUserName&quot;&gt;weblogic&lt;/property&gt;
      &lt;property name=&quot;adminPassword&quot;&gt;weblogic12#&lt;/property&gt;
      &lt;property name=&quot;target&quot;&gt;AdminServer&lt;/property&gt;
    &lt;/configuration&gt;
  &lt;/container&gt;
&lt;/arquillian&gt;
```

Kwalifikatora można opcjonalnie użyć do wyboru oczekiwanego kontenera poprzez konfigurację mavenowej wtyczki *surefire/failsafe*:
```xml
&lt;configuration&gt;
    &lt;skip&gt;true&lt;/skip&gt;
    &lt;systemProperties&gt;
        &lt;arquillian.launch&gt;wls-managed&lt;/arquillian.launch&gt;
    &lt;/systemProperties&gt;
&lt;/configuration&gt;
```
W przypadku IntelliJ wyboru dokonujemy w konfiguracji kontenera Arquillian:

<img loading="lazy" src="/img/hq/arquillian-intellij-qualifier.png" alt="Kwalifikator kontenera Arquillian" title="Kwalifikator kontenera Arquillian">

## Przypadek testowy

Aby sprawdzić, czy nasza konfiguracja działa poprawnie, możemy stworzyć najprostszego Beana:

```java
import javax.ejb.Stateless;

@Stateless
public class Greeter {
    public String greet() {
        return "Hello world";
    }
}
```

… i przypadek testowy:

```java
import static org.hamcrest.core.IsEqual.equalTo;
import static org.hamcrest.core.IsNull.notNullValue;
import static org.junit.Assert.assertThat;


import javax.ejb.EJB;
import org.jboss.arquillian.container.test.api.Deployment;
import org.jboss.arquillian.junit.Arquillian;
import org.jboss.shrinkwrap.api.Archive;
import org.jboss.shrinkwrap.api.ShrinkWrap;
import org.jboss.shrinkwrap.api.spec.JavaArchive;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(Arquillian.class)
public class GreeterIT {

    @EJB
    private Greeter greeter;

    @Deployment
    public static Archive<?> getTestArchive() {
        final JavaArchive jar = ShrinkWrap.create(JavaArchive.class, "test.jar")
                .addClasses(Greeter.class);
        System.out.println(jar.toString(true));
        return jar;
    }

    @Test
    public void shouldInjectEjb() {
        assertThat(greeter, notNullValue());
        assertThat(greeter.greet(), equalTo("Hello world"));
        System.out.println(greeter.greet());
    }

}
```

Podczas uruchamiania test powinien wypisać zawartość testowanego archiwum. Po pomyślnym jego zakończeniu, w logach WebLogica powinien ukazać się napis `Hello world` – test docelowo zostanie uruchomiony w kontenerze (w przeciwieństwie do sytuacji, gdy użyjemy adnotacji `@RunAsClient`).

## Typowe problemy

Podczas konfiguracji możesz natknąć się na różnego rodzaju błędy. Najczęstsze z nich to:

> java.io.FileNotFoundException: ...\wlserver\.product.properties (The system cannot find the path specified)

Zmienna środowiskowa `WL_HOME` może wskazywać na niewłaściwy katalog.

> java.lang.ClassNotFoundException: javax.ejb.embeddable.EJBContainer<br/>
> javax.ejb.EJBException: No EJBContainer provider available: no provider names had been found.

Zwykle błędy spowodowane niewłaściwą ścieżką do pliku `weblogic.jar` lub brakującymi zależnościami (`org.jboss.arquillian.container`).

> Missing descriptor: weblogic.management.DeploymentException: [J2EE:160177]

Oznacza to, że brakuje odpowiednich deskryptorów i należy je dodać podczas tworzenia archiwum za pomocą ShrinkWrap.

> sun.misc.InvalidJarIndexException: Invalid index

`WL_HOME` wskazuje na wersję 12.2 bądź brakuje następujących parametrów JVM podczas wykonywania testów `-da -Djava.system.class.loader=com.oracle.classloader.weblogic.LaunchClassLoader`.

> javax.naming.NamingException: Couldn't connect to the specified host

Sprawdź, czy `adminUrl` ma prawidłową wartość i serwer nasłuchuje pod danym adresem.