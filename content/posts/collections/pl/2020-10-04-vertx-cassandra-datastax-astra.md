---
title: Vert.x Cassandra Client i DataStax Astra
url: vertx-cassandra-client-datastax-astra
id: 40
tags:
  - java
  - bazy danych
  - vertx
author: Damian Terlecki
date: 2020-10-04T20:00:00
---

DataStax Astra to dystrybucja bazy danych NoSQL Apache Cassandra™ oparta na modelu DBaaS (Database as a Service). Obudowana w dodatkowy interfejs GraphQL oraz API REST-owe jest bardzo ciekawym produktem, który warto wziąć pod uwagę podczas wyboru bazy danych do aplikacji. Od maja 2020 możemy wypróbować takie rozwiązanie za darmo (10 GB w chmurze Google).

Jeśli aplikację chcemy zbudować w oparciu o Vert.x, to możemy do tego wykorzystać moduł [io.vertx:vertx-cassandra-client](https://vertx.io/docs/vertx-cassandra-client/java/). Z jednej strony, moduł ten wykorzystuje sterowniki firmy DataStax, z drugiej jednak wersja zależności jest dosyć wiekowa i możemy mieć trudności w ustawieniu połączenia z bazą. Jeśli nie interesuje nas połączenie za pomocą sterowników, nie ma przeszkód żebyśmy skorzystali z komunikacji HTTP.

## Połączenie z bazą

Po [utworzeniu bazy](https://astra.datastax.com/register) i przejściu do strony opisującej sposoby połączenia, dostajemy możliwość pobrania paczki potrzebnej do bezpiecznego połączenia z bazą. W paczce znajdują się certyfikaty TLS oraz namiary na naszą bazę. W [dokumentacji](https://docs.astra.datastax.com/docs/migrating-your-datastax-java-driver-to-connect-with-astra-databases) szybko odnajdziemy przykładowy kod potrzebny do ustanowienia takiego połączenia.

<img src="/img/hq/datastax-astra-connection.png" alt="DataStax Astra – strona przedstawiająca metody połączenia" title="DataStax Astra – strona przedstawiająca metody połączenia">

Obecna wersja vertx-cassandra-client (3.9.x) używa sterowników DataStax com.datastax.cassandra:cassandra-driver-core w wersji 3.5.0. Niestety, opisana w dokumentacji metoda konfigurująca połączenie z bazą (withCloudSecureConnectBundle) z pliku dostarczonego przez DataStax została dodana dopiero w wersji 3.8.0. Musimy podbić wersję sterownika, gdyż nowsza wersja Vert.x'a 4.0 (beta) nie rozwiązuje jeszcze tego problemu.

<table class="rwd">
   <thead>
      <tr>
         <th>Vert.x</th>
         <th>Wesja sterownika w Vert.x</th>
         <th>withCloudSecureConnectBundle</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Vert.x">io.vertx:vertx-cassandra-client:3.9.3</td>
         <td data-label="Wesja sterownika w Vert.x">com.datastax.cassandra:cassandra-driver-core:3.5.0</td>
         <td data-label="withCloudSecureConnectBundle">com.datastax.cassandra:cassandra-driver-core:3.8.0+</td>
      </tr>
      <tr>
         <td data-label="Vert.x">io.vertx:vertx-cassandra-client:4.0.0-milestone5</td>
         <td data-label="Wesja sterownika w Vert.x">com.datastax.oss:java-driver-core:4.2.2</td>
         <td data-label="withCloudSecureConnectBundle">com.datastax.oss:java-driver-core:4.3.0+</td>
      </tr>
    </tbody>
</table>

## Konfiguracja zależności

W przypadku wersji Vert.x oprócz podbicia wersji minor sterownika 3.x, konieczne będzie dodatkowo obniżenie wersji modułu guava z 25.1-jre (wykorzystywany przez Vert.x) do 19.0 (wykorzystywany przez sterownik). W ten sposób unikniemy poniższego błędu:

```plaintext
java.lang.NoSuchMethodError: 'java.lang.String com.google.common.net.HostAndPort.getHostText()'
	at com.datastax.driver.core.CloudConfigFactory.getSniProxyAddress(CloudConfigFactory.java:232)
	at com.datastax.driver.core.CloudConfigFactory.createCloudConfig(CloudConfigFactory.java:119)
	at com.datastax.driver.core.Cluster$Builder.withCloudSecureConnectBundle(Cluster.java:1456)
```

W przypadku Gradle zrobimy to za pomocą prostej konfiguracji zależności aplikacji w standardowym pliku `build.gradle`:

```groovy
dependencies {
    // ...
    implementation('io.vertx:vertx-cassandra-client:3.9.3') {
        exclude group: 'com.google.guava', module: 'guava'
    }
    implementation group: 'com.google.guava', name: 'guava', version: '19.0'
    implementation 'com.datastax.cassandra:cassandra-driver-core:3.10.2'
    // ...
}
```

Dla pliku `pom.xml` Mavena będzie to wyglądało mniej więcej tak:

```xml
<project>
  <!-- ... -->
  <dependencies>
    <!-- ... -->
    <dependency>
      <groupId>io.vertx</groupId>
      <artifactId>vertx-cassandra-client</artifactId>
      <version>3.9.3</version>
      <scope>compile</scope>
      <exclusions>
        <exclusion>
          <groupId>com.google.guava</groupId>
          <artifactId>guava</artifactId>
        </exclusion>
      </exclusions> 
    </dependency>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>19.0</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>com.datastax.cassandra</groupId>
      <artifactId>cassandra-driver-core</artifactId>
      <version>3.10.2</version>
      <scope>compile</scope>
    </dependency>
    <!-- ... -->
  </dependencies>
  <!-- ... -->
</project>
```

## Kod

Generalnie taka konfiguracja powinna wystarczyć do ustanowienia połączenia w wersji 3.x (Vert.x/sterownik). Po umieszczeniu paczki konfiguracyjnej w folderze resources oraz ustawieniu loginu i hasła będziemy w stanie utworzyć klienta, za pomocą którego wywołamy zapytania na bazie Astra:

```java
CassandraClientOptions options = new CassandraClientOptions(Cluster.builder()
        .withCloudSecureConnectBundle(Thread.currentThread().getContextClassLoader().getResourceAsStream("secure-connect-<db_name>.zip"))
        .withAuthProvider(new PlainTextAuthProvider(config.getString("cassandra.login"), config.getString("cassandra.password"))));

CassandraClient client = CassandraClient.create(vertx, options);
```

W celu sprawdzenia połączenia możemy wywołać proste zapytanie:

```java
client.execute("SELECT now() FROM system.local;", res -> {
    if (res.failed()) {
        logger.error("NOK", res.cause());
    } else {
        logger.info("OK " + res.result());
    }
});
```

Podobny zabieg (konfiguracyjny), prawdopodobnie już bez wykluczania Guavy wymagany będzie również w przypadku obecnej wersji 4.x. Zakładając oczywiście, że interfejs najnowszego sterownika 4.3+ jest kompatybilny wstecz ze sterownikiem 4.2.2 wykorzystywanym przez Vert.x w wersji beta (kamień milowy 5). Osobiście jeszcze tego nie testowałem, ale zachęcam do wypróbowania i podzielenia się wynikami.