---
title: Stubowanie biblioteki Java z pomocą ClassLoadera
url: stubowanie-biblioteki-java-classloading
id: 29
tags:
  - java
  - tomcat
  - weblogic
  - classloading
  - jvm
  - testy
author: Damian Terlecki
date: 2020-05-03T20:00:00
---

Czasami możemy stanąć przed zadaniem zintegrowania naszej aplikacji z systemem zewnętrznym, do którego nie będziemy mieli dostępu na naszym środowisku. Sytuacja, w której integrację można przetestować tylko na infrastrukturze klienta, jest dosyć kłopotliwa. Szczególnie gdy wiąże się ona z głównymi funkcjonalnościami naszego systemu. Niektóre komponenty dostarczane przez klienta mogą wymagać połączenia z usługami, których istnienia nie będziemy świadomi.

Jeśli jest to jednak jakaś usługa internetowa, zwykle możemy sobie stworzyć jej **mock/stub**. Lokalnie świetnie nadaje się do tego Postman lub SoapUI. W przypadku środowiska testowego moglibyśmy uruchomić do tego [specjalny serwer](https://www.mock-server.com/). Co, jeśli do takiej integracji korzystamy z zewnętrznej biblioteki dostarczonej przez klienta i nie znamy detali na temat implementacji?

W takim przypadku na pewno możemy stworzyć fasadę dla takiej biblioteki. W oparciu o zmienną środowiskową lub profil budowania mielibyśmy dwie osobne wersje. Jedna dla środowiska testowego, a druga dla środowiska testowego na infrastrukturze klienta. Jeśli jednak nie chcemy, aby nasz kod z testowymi danymi był zawarty w przetestowanej wersji produkcyjnej, możemy stworzyć *stuby* samej biblioteki.

### Stubowanie biblioteki

Ponieważ wiemy, z których klas biblioteki korzystamy, i wiemy mnie więcej, jakich danych powinniśmy się spodziewać od klienta, jesteśmy gotowi by stworzyć stuby. Proces jest dość prosty i nieco podobny do pisania testów jednostkowych bez użycia bibliotek typu Mockito. Musimy stworzyć tę samą klasę z pakietu biblioteki z metodami, których używamy w naszej aplikacji.

Jako przykład weźmy bibliotekę Apache Commons Lang 3 – jedną z najpopularniejszych bibliotek pomocniczych. Jeśli chcielibyśmy utworzyć stuba metody `StringUtils.capitalize()`, który zwracałby predefiniowaną wartość, musielibyśmy utworzyć klasę `src/main/java/org/apache/commons/lang3/StringUtils.java`, skompilować ją i spakować w oddzielnym pliku JAR (lub bez pakowania wykorzystać skompilowaną klasę z katalogu `classes`):

```java
package org.apache.commons.lang3;

public class StringUtils {

    public static String capitalize(String text) {
        return "USTALONA_WARTOŚĆ";
    }

}
```

Warto pamiętać, że istnieją również inne metody w tej klasie. Jeśli nie stworzymy dla nich stubów, a później odwołamy się do nich pośrednio (np. inne klasy z tej samej biblioteki mogą na nich bazować) lub bezpośrednio, wyrzucony zostanie wyjątek:

> Exception in thread "main" java.lang.NoSuchMethodError: org.apache.commons.lang3.StringUtils.uncapitalize(Ljava/lang/String;)Ljava/lang/String;


### Classloading

Zakładając, że twoja aplikacja uruchamia się w obrębie JVM, warto przypomnieć sobie, w jaki sposób ładowane są klasy. Za proces ten odpowiada ClassLoader, który jest w zasadzie również klasą. Jednym wyjątkiem wartym odnotowania jest Bootstrap ClassLoader, który de facto nie ma odpowiednika klasy, a wykonywany jest w postaci kodu natywnego (metoda ClassLoadera `findBootstrapClassOrNull(String)`).

Trzy standardowe ClassLoadery to:
1. Bootstrap ClassLoader – ładuje wybrane klasy potrzebne środowisku uruchomieniowemu JRE z katalogu `$JAVA_HOME/jre/lib`.
2. Extension ClassLoader – ładuje zainstalowane rozszerzenia z katalogu `$JAVA_HOME/jre/lib/ext`. <b class = "err">Mechanizm usunięty wraz z nadejściem Javy 9!</b>
3. System (Application) ClassLoader – ładuje klasy ze ścieżki classpath, potrzebne do uruchomienia aplikacji.

Domyślnym modelem ładowania klas jest tzw. [delegacja rodzicielska](https://docs.oracle.com/javase/tutorial/ext/basics/load.html). Oznacza to, że jeśli na dole hierarchii ClassLoaderów pojawi się żądanie załadowania klasy, ClassLoader najpierw oddeleguje żądanie do swojego rodzica, zanim spróbuje załadować klasę samodzielnie.

Sposób działania tego mechanizmu można prześledzić, analizując kod klasy `java.lang.ClassLoader` (źródło: [OpenJDK 11](https://github.com/AdoptOpenJDK/openjdk-jdk11/blob/master/src/java.base/share/classes/java/lang/ClassLoader.java), GPL 2.0; usunięto pomiary czasowe dla zachowania przejrzystości):

```java
    protected Class<?> loadClass(String name, boolean resolve)
        throws ClassNotFoundException
    {
        synchronized (getClassLoadingLock(name)) {
            // First, check if the class has already been loaded
            Class<?> c = findLoadedClass(name);
            if (c == null) {
                try {
                    if (parent != null) {
                        c = parent.loadClass(name, false);
                    } else {
                        c = findBootstrapClassOrNull(name);
                    }
                } catch (ClassNotFoundException e) {
                    // ClassNotFoundException thrown if class not found
                    // from the non-null parent class loader
                }

                if (c == null) {
                    // If still not found, then invoke findClass in order
                    // to find the class.
                    c = findClass(name);
                }
            }
            if (resolve) {
                resolveClass(c);
            }
            return c;
        }
    }
```

W rezultacie, jeśli mamy bibliotekę umieszczoną na ścieżce classpath ClassLoadera Aplikacyjnego i w katalogu Extensions ClassLoadera, załadowana zostanie wersja biblioteki z tego drugiego (jest wyżej w hierarchii). Zakładając, że nie zaimplementowaliśmy żadnego niestandardowego ładowania klas, które łamałoby ten model delegacji, możemy użyć tego mechanizmu i umieścić wersję biblioteki z naszymi stubami w katalogu `$JAVA_HOME/jre/lib/ext`.


### Serwery aplikacyjne

Wszystkie serwery aplikacyjne udostępniają do użytku dodatkowe ClassLoadery. Pozwala to aplikacjom na bezkonfliktowy dostęp do różnych klas i zasobów oraz umożliwia współdzielenie bibliotek.

Common ClassLoader, to ClassLoader dosyć powszechny w wielu kontenerach aplikacji. Zwykle to właśnie on odpowiada za ładowanie klas, które będą widoczne dla wszystkich aplikacji wdrożonych na danym serwerze. Jest to nieco lepsze miejsce do umieszczenia naszej biblioteki ze stubami. Dzięki temu nie zanieczyszczamy Extensions ClassLoadera, który jest „współdzielony” przez wszystkie maszyny JVM.

W zależności od serwera taką bibliotekę możemy umieścić w:
- `WebSphere/AppServer/lib/ext` w przypadku serwera WebSphere;
- `$DOMAIN_DIR/lib/classes/` (pliki `*.class`) i `$DOMAIN_DIR/lib/` (JAR-y) dla rozwiązania wykorzystujacego GlassFisha;
- `$DOMAIN_DIR/lib` w przypadku WebLogica;
- `$CATALINA_BASE/lib` i `$CATALINA_HOME/lib` dla Tomcata;
- [Moduł globalne](http://docs.wildfly.org/19/Developer_Guide.html#global-modules) i [katalog globalny](http://docs.wildfly.org/19/Developer_Guide.html#global-directory) w WildFly.

### Tomcat

Tomcat ma nieco odwrócony moduł ładowania. Najpierw ładowane są klasy Bootstrap potrzebne do działania JVM, następnie klasy z naszej aplikacji WWW, a na koniec klasy systemowe i wspólne (Common ClassLoader). Aby włączyć standardowy model delegowania, należy dodać element `&lt;Loader delegate=&quot;true&quot;/&gt;` wewnątrz `&lt;Context&gt;&lt;/Context&gt;` w konfiguracji Tomcata `conf/context.xml` bądź w naszej paczce WAR w katalogu `META-INF/context.xml`.

```xml
&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;
&lt;Context&gt;
  &lt;Loader delegate=&quot;true&quot;/&gt;
  &lt;WatchedResource&gt;WEB-INF/web.xml&lt;/WatchedResource&gt;
  &lt;WatchedResource&gt;${catalina.base}/conf/web.xml&lt;/WatchedResource&gt;
&lt;/Context&gt;
```

### Podsumowanie

Wiedza o tym, jak ładowane są klasy naszej aplikacji, daje szerokie pole do popisu. W kilku prostych krokach można podmienić bibliotekę lub klasę z kodem testowym bez konieczności ingerencji w kod samej aplikacji. Zapewnia to większą elastyczność w testowaniu naszego systemu, gdy nie jesteśmy w stanie w pełni odtworzyć infrastruktury klienta oraz usług ukrytych za interfejsem biblioteki.

Z drugiej strony, ponieważ metoda ta skutkuje współdzieleniem biblioteki pomiędzy wieloma aplikacjami, należy wziąć pod uwagę wszystkie zalety i wady takiego rozwiązania. Posunięcie się zbyt daleko może pociągać za sobą trudności w utrzymaniu środowisk testowych.

Na sam koniec, warto również wspomnieć, że mechanizm rozszerzeń i ładowania klas z `$JAVA_HOME/jre/lib/ext` został usunięty z Javy 9 i wyżej, z powodu modularyzacji ([JEP 220](https://openjdk.java.net/jeps/220#Removed:-The-extension-mechanism)). Aby osiągnąć podobny rezultat w aplikacji nieserwerowj, używając tylko ApplicationClassLoadera, możesz podać stuby biblioteki (JAR-y, bądź klasy) w ścieżce classpath, przed oryginalnymi ich odpowiednikami.

> Interpreter Javy wyszuka klas w katalogach w kolejności, w jakiej pojawiają się w zmiennej classpath [[Java 8 Specyfikacja kolejności]](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/classpath.html#sthref15).