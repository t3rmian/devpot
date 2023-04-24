---
title: „Invalid POM” a zmienne mavenowe
url: maven-invalid-pom
id: 108
category:
  - java: Java
tags:
  - maven
  - jaxws
  - jakarta
author: Damian Terlecki
date: 2023-04-14T20:00:00
---

Do zarządzania budowaniem projektu Maven korzysta z pliku konfiguracyjnego `pom.xml`. Podczas parsowania pliku
narzędzie analizuje zależności projektu i określa, jakie biblioteki i narzędzia są wymagane do poprawnego zbudowania
artefaktów. W procesie tym Maven sięga również do plików POM poszczególnych zależności, aby określić wszystkie wymagane artefakty tranzytywne.

## Nierozpoznawalne wyrażenia mavenowe

Może się zdarzyć, że plik biblioteki ze zdalnego repozytorium będzie zawierał błędy, nie tyle ile składniowe, ale logiczne.
Jednym z powodów tego typu błędów jest użycie wyrażeń odnoszących się do nieistniejących [właściwości/zmiennych mavenowych](https://maven.apache.org/pom.html#Properties). 
W przypadku wystąpienia błędów podczas przetwarzania zależności, Maven może pominąć zaciąganie artefaktów tranzytywnych i na wyjściu programu zauważymy przykładowe ostrzeżenie:

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details' alt='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details'>

Szybko zauważymy, że zależności zadeklarowane w `pom.xml` biblioteki są kompletnie niewidoczne w projekcie.
Aby dowiedzieć się więcej na temat problemu, wystarczy, że dodamy parametr `-X`, który jest skrótem dłuższej jego formy `--debug`.

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' for com.sun:tools:jar must specify an absolute path but is ${tools.jar} @

W tym konkretnym przypadku Maven nie jest w stanie przeprowadzić ewaluacji wyrażenia `${tools.jar}`.
Przeglądając pliki `pom.xml`, dochodzimy do wniosku, że wyrażenie to jest potrzebne do zdefiniowania namiarów na bibliotekę systemową `tools` w jednym z nadrzędnych pomów:

```xml
<!--...-->
<profiles>
    <!--...-->
    <profile>
        <id>default-tools.jar</id>
        <activation>
            <file>
                <exists>${java.home}/../lib/tools.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../lib/tools.jar</tools.jar>
        </properties>
    </profile>
    <profile>
        <id>default-tools.jar-mac</id>
        <activation>
            <file>
                <exists>${java.home}/../Classes/classes.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../Classes/classes.jar</tools.jar>
        </properties>
    </profile>
</profiles>
<!--...-->
<dependencyManagement>
    <dependencies>
        <!-- JDK dependencies -->
        <dependency>
            <groupId>com.sun</groupId>
            <artifactId>tools</artifactId>
            <version>1.6</version>
            <scope>system</scope>
            <systemPath>${tools.jar}</systemPath>
        </dependency>
    </dependencies>
    <!--...-->
</dependencyManagement>
<!--...-->
```

Po przejrzeniu zależności tego konkretnego artefaktu możemy nawet dojść do wniosku, że zależność systemowa nie jest wykorzystywana w tym podmodule.
Niestety brak pliku w lokalizacji `${java.home}/../lib/tools.jar` lub `${java.home}/../Classes/classes.jar` sprawia, że zmienna `${tools.jar}` nie jest ustawiana.

Konkretnie w tej sytuacji problem jest związany z wersją JDK 11+. W tej wersji nastąpiło usunięcie powyższych bibliotek i dopiero zależności z wersji `jaxws-rt:2.3.x`
obsługują nowsze wersje JDK, ponadto ciągnąc za sobą aktualizację wersji specyfikacji biblioteki.

Problem jest jednak bardziej ogólny i można go ekstrapolować do sytuacji, w której Maven nie jest w stanie przeprowadzić ewaluacji wyrażenia nawiązującego do zmiennej.
Co zrobić w przypadku gdy natkniemy się na podobny błąd?

## Ewaluacja wyrażeń w pliku POM

Kolejność ewaluacji źródeł zakodowana jest w [`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175) dla Mavena w wersji 3/4 i w uproszczeniu
przedstawia się następująco:
- Java Properties – `-Dzmienna=wartosc`;
- zmienne Mavenowe – `<properties><zmienna>wartosc</zmienna></properties>`;
- zmienne środowiskowe – `set/export zmienna=wartosc`.

O ile zmienne mavenowe są dziedziczone przez moduły w projekcie wielomodułowym, to słusznie nie wyciekają jednak do zależności zewnętrznych.
Zmienne Javy i środowiskowe inicjalizowane są na początku budowania modelu Mavena, dlatego dodanie ich w trakcie wywołania nie wpływa na ewaluację. 
Dodatkowo w przypadku zależności zewnętrznych, zmienne Javy konsolidowane są do poziomu zmiennych środowiskowych ([MNG-7563](https://issues.apache.org/jira/browse/MNG-7563)).

Znając powyższe zasady, zmienną mavenową w konfiguracji `pom.xml` możemy zainicjalizować na kilka różnych sposobów np. poprzez:
- zmienną systemową (uwaga na problemy z eksportem zmiennych zawierających kropkę w systemach unikso-podobnych); 
- zmienną Javy podaną przy wywołaniu mavena `mvn -Dzmienna=wartość validate`; 
- zmienną systemową podaną przy wywołaniu mavena `zmienna=wartosc mvn validate`; 
- plik relatywny do korzenia projektu `.mvn/maven.config` z ustawiający wartość zmiennej Javy `-Dzmienna=wartość`; 
- globalny plik poleceń np. `~/.mavenrc` ustawiający zmieną środowiskową `set/export zmienna=wartość` (uwaga na problemy z IntelliJ, np. [IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner)).

Ostatnią deską ratunku z pewnością można nazwać ręczne (bądź pośrednie) zaciągnięcie i dodanie zależności do ścieżki kompilacji/budowania artefaktu.

> Jako alternatywne narzędzie budowania, Gradle w wersji 4-8 wypada tutaj lepiej. W tym przypadku nie wyrzuca błędu i zależności tranzytywne, których nie dotyczy problem, są poprawnie importowane.