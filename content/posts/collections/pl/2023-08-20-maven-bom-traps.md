---
title: Maven i nadpisywanie zależności zarządzanych w sekcji zależności
url: maven-bom-nadpisywanie-zależności
id: 114
category:
  - java: Java
tags:
  - maven
author: Damian Terlecki
date: 2023-08-20T20:00:00
source: https://issues.apache.org/jira/browse/MNG-6141
---

Poprawnie wykorzystanie sekcji `dependencyManagement` w konfiguracji projektu Maven ułatwia utrzymanie spójności wersji i zapobiega konfliktom zależności.
Łatwo jednak doprowadzić do sytuacji, w której poprzez nadpisanie zależności przez `dependencies`, Maven rozstrzygnie nieodpowiednią wersję przy imporcie naszego projektu.

## Nadpisywanie *dependencyManagement* w *dependencies* jako antywzorzec

Zobaczmy ten problem na przykładzie biblioteki korzystającej ze Springa, która wymaga `spring-core` i nadpisanej wersji `spring-jcl`.
O ile sam przykład nie wydaje się praktyczny (zazwyczaj aktualizujemy cały BOM springowy) to sam sposób rozstrzygania zależności
może mieć wpływ na Twój projekt (a znajomość takiej sytuacji jest wartościowa, również przy zarządzaniu zależnościami pomiędzy modułami).

### Klient nie korzystający z *dependencyManagement*

Zobaczmy konfigurację `pom.xml` takiej biblioteki:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>org.example</groupId>
    <artifactId>lib-a</artifactId>
    <version>1.0-SNAPSHOT</version>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework</groupId>
                <artifactId>spring-framework-bom</artifactId>
                <version>6.0.0</version>
                <scope>import</scope>
                <type>pom</type>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-jcl</artifactId>
            <version>6.0.1</version>
        </dependency>
    </dependencies>
</project>
```

Konfiguracja klienta dodającego bibliotekę może wyglądać następująco:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>org.example</groupId>
    <artifactId>client</artifactId>
    <version>1.0-SNAPSHOT</version>

    <dependencies>
        <dependency>
            <groupId>org.example</groupId>
            <artifactId>lib-a</artifactId>
            <version>1.0-SNAPSHOT</version>
        </dependency>
    </dependencies>
</project>
```

Po uruchomieniu wtyczki `maven-dependency-plugin` z celem `tree` listującym zależności obu projektów oraz parametrem `-Dverbose=true`
otrzymujemy dodatkowe informacje na temat rozstrzygniętych wersji bibliotek:
```shell
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ lib ---
[INFO] org.example:lib-a:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:6.0.0:compile
[INFO] |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO] \- org.springframework:spring-jcl:jar:6.0.1:compile
--
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ client ---
[INFO] org.example:client:jar:1.0-SNAPSHOT
[INFO] \- org.example:lib-a:jar:1.0-SNAPSHOT:compile
[INFO]    +- org.springframework:spring-core:jar:6.0.0:compile
[INFO]    |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO]    \- org.springframework:spring-jcl:jar:6.0.1:compile
```

Wszystko się zgadza, w obu projektach otrzymujemy te same wersje zależności nadpisane w ramach `dependencies` naszej biblioteki.
Termin `omitted for conflict` oznacza, że już wcześniej inna wersja została wybrana jako pierwsza zgodnie ze
[standardową kolejnością rozstrzygania zależności](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#transitive-dependencies).


### Klient korzystający z *dependencyManagement*

Często zdarza się, że klient również korzysta z wybranego BOMa w celu zdefiniowania wersji innych wykorzystywanych bibliotek.
Stąd rodzi się intuicyjne pytanie. Jaką wersję zależności rozstrzygnie Maven,
importując BOM biblioteki nadpisującej zależność tranzytywną poprzez `dependencies`?

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>org.example</groupId>
    <artifactId>client</artifactId>
    <version>1.0-SNAPSHOT</version>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.example</groupId>
                <artifactId>lib-a</artifactId>
                <version>1.0-SNAPSHOT</version>
                <scope>import</scope>
                <type>pom</type>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.example</groupId>
            <artifactId>lib-a</artifactId>
            <version>1.0-SNAPSHOT</version>
        </dependency>
    </dependencies>
</project>
```

Okazuje się, że wersja `spring-jcl` różni się między biblioteką a projektem korzystającym z tej biblioteki.

```shell
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ lib-a ---
[INFO] org.example:lib-a:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:6.0.0:compile
[INFO] |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO] \- org.springframework:spring-jcl:jar:6.0.1:compile
--
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ client ---
[INFO] org.example:client:jar:1.0-SNAPSHOT
[INFO] \- org.example:lib-a:jar:1.0-SNAPSHOT:compile
[INFO]    +- org.springframework:spring-core:jar:6.0.0:compile
[INFO]    |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - version managed from 6.0.1; omitted for duplicate)
[INFO]    \- org.springframework:spring-jcl:jar:6.0.0:compile
```

Termin `X version managed from Y` oznacza, że wersja `X` została nadpisana wersją `Y` poprzez `dependencyManagement` (*managed* — *dependencyManagement*).
Przykład rozszerza się na sytuację, w której biblioteka bądź klient korzystają z rodzica importującego BOM z daną zależnością.
Takie nadpisanie w kontekście biblioteki korzystającej z `dependencyManagement` często może być nieświadomym wynikiem konieczności aktualizacji podatnej zależności tranzytywnej.

Tag `exclusions` dla importu typu `pom` w `dependencyManagement` niestety nie działa w obecnej wersji wykluczająco (Maven 3.8/3.9).
Również zależności importowane poprzez typ `pom` wewnątrz `dependencies` traktowane są jako zależności tranzytywnych i sprawiają, że nie są one traktowane
jako "najbliższe" w momencie priorytetyzacji poprzez `dependencyManagement.

<img loading="lazy" src="/img/hq/maven-dependency-management-dependency-override.png" title='POM import na poziomie "dependencies"' alt='POM import na poziomie "dependencies"'>

Jeśli biblioteka ma być importowana wraz z BOMem, to najprostszym rozwiązaniem jest przeniesienie nadpisania właśnie do `dependencyManagement` lub stworzenie własnego artefaktu BOM.
W pozostałych przypadkach klient, po dostatecznych testach, zmuszony będzie nadpisać zależności na własną rękę.