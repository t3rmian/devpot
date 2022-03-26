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
<dependency>
  <groupId>org.jboss.arquillian.junit</groupId>
  <artifactId>arquillian-junit-container</artifactId>
  <scope>test</scope>
</dependency>
```

Następnie musimy wybrać, z jakiego rodzaju kontenera (a właściwie połączenia) skorzystamy:
- kontener osadzony – działa w tej samej maszynie JVM (nie jest preferowany, może działać niespójnie, wymaga czasu na uruchomienie);
- kontener zarządzany – jest podobny do kontenera zdalnego, ale cyklem jego życia zarządza sam Arquillian;
- kontener zdalny – znajduje się w oddzielnej maszynie JVM.

```xml
<dependency>
  <groupId>org.jboss.arquillian.container</groupId>
<!--  <artifactId>arquillian-wls-embedded-12.1</artifactId>-->
<!--  <artifactId>arquillian-wls-managed-12.1</artifactId>-->
  <artifactId>arquillian-wls-remote-12.1</artifactId>
  <version>1.0.1.Final</version>
  <scope>test</scope>
</dependency>
```

## Kontener osadzony

Warto nadmienić, że w trybie osadzonym prędzej czy później napotkamy problemy, które nie będą pojawiały się w dwóch pozostałych przypadkach. Jeśli masz zamiar przetestować coś bardziej złożonego, powinieneś wiedzieć o [ryzyku związanym z osadzonymi kontenerami](http://arquillian.org/blog/2012/04/13/the-danger-of-embedded-containers/).

### Maven

Jeśli chcesz wykorzystać kontener w trybie osadzonym, musimy go obligatoryjnie dołączyć do ścieżki classpath. Można tego dokonać za pomocą właściwości `additionalClasspathElements` w konfiguracji wtyczki mavenowej *surefire* (testy jednostkowe) lub wtyczki *failsafe* (testy integracyjne). Samą wtyczkę standardowo umieszczamy w sekcji `<build&gt` wewnątrz `<plugins&gt`.

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-failsafe-plugin</artifactId>
  <version>2.17</version>
  <executions>
    <execution>
      <goals>
        <goal>integration-test</goal>
      </goals>
    </execution>
  </executions>
  <configuration>
    <skip>false</skip>
    <!-- Disable assertions otherwise an assertionerror involving the WLS management runtime is thrown -->
    <enableAssertions>false</enableAssertions>
    <classpathDependencyExcludes>
      <classpathDependencyExcludes>javax:javaee-api</classpathDependencyExcludes>
    </classpathDependencyExcludes>
    <additionalClasspathElements>
      <!-- This requires setting WL_HOME environment variable e.g.: C:/Ora/wlserver/ -->
      <additionalClasspathElement>${env.WL_HOME}/server/lib/weblogic.jar</additionalClasspathElement>
    </additionalClasspathElements>
  </configuration>
</plugin>
```

Przy powyższej konfiguracji testy integracyjne możemy uruchomić za pomocą polecenia `mvn verify`.

### IntelliJ

Możliwość uruchamiania testów z poziomu IDE jest bardzo przydatna. W tym przypadku IntelliJ zapewnia świetne wsparcie również dla kontenera wbudowanego.
Wszystko, co musimy zrobić, to dodać konfigurację uruchomieniową. Wybieramy Arquillian JUnit, a w menu konfiguracji kontenerów wybieramy tryb osadzony.

<figure class="center-text">
<img loading="lazy" class="inline" src="/img/hq/arquillian-intellij-configuration.png" alt="Arquillian test run configuration" title="Arquillian test run configuration">
<img loading="lazy" class="inline" src="/img/hq/arquillian-intellij-configure.png" alt="Arquillian container configuration" title="Arquillian container configuration">
<br/>
<img loading="lazy" class="inline-end" src="/img/hq/arquillian-intellij-container.png" alt="Adding Arquillian container" title="Adding Arquillian container">
</figure>

Teraz jednym kliknięciem (`CTRL+SHIFT+F10`) powinniśmy być w stanie wywołać wybrany test.

## Kontenery zarządzane i zdalne

Konfiguracja połączenia z kontenerem w trybie zarządzanym bądź zdalnym odbywa się poprzez plik `src/test/resources/arquillian.xml`. Przykładowa struktura pliku z opcjonalną zmienną środowiskową `WL_HOME` wskazującą na wersję 12.1:

```xml
<?xml version="1.0"?>
<arquillian xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://jboss.org/schema/arquillian"
  xsi:schemaLocation="http://jboss.org/schema/arquillian http://jboss.org/schema/arquillian/arquillian_1_0.xsd">

  <engine>
    <property name="deploymentExportPath">target/</property>
  </engine>

  <container qualifier="wls-managed">
    <configuration>
      <!-- element opcjonalny jeśli zmienna środowiskowa WL_HOME jest ustawiona -->
      <property name="wlHome">C:/Ora/wlserver</property>
      <!-- ścieżka do domeny -->
      <property name="domainDirectory">C:/Ora/wlserver/user_projects/domains/base_domain/</property>
      <property name="adminUrl">t3://localhost:7001</property>
      <property name="adminUserName">weblogic</property>
      <property name="adminPassword">weblogic12#</property>
      <property name="target">AdminServer</property>
    </configuration>
  </container>

  <container qualifier="wls-remote" default="true">
    <configuration>
      <!-- element opcjonalny jeśli zmienna środowiskowa WL_HOME jest ustawiona -->
      <property name="wlHome">C:/Ora/wlserver</property>
      <property name="adminUrl">t3://localhost:7001</property>
      <property name="adminUserName">weblogic</property>
      <property name="adminPassword">weblogic12#</property>
      <property name="target">AdminServer</property>
    </configuration>
  </container>
</arquillian>
```

Kwalifikatora można opcjonalnie użyć do wyboru oczekiwanego kontenera poprzez konfigurację mavenowej wtyczki *surefire/failsafe*:
```xml
<configuration>
    <skip>true</skip>
    <systemProperties>
        <arquillian.launch>wls-managed</arquillian.launch>
    </systemProperties>
</configuration>
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