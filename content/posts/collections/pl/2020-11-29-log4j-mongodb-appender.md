---
title: Jak skonfigurować logowanie do MongoDB przy pomocy log4j2
url: log4j2-mongodb-appender
id: 44
category:
- java: Java
tags:
  - mongodb
  - logi
author: Damian Terlecki
date: 2020-11-29T20:00:00
---

Podstawowa konfiguracja biblioteki do logowania *log4j2* opiera się o dwa elementy: Appender i Logger. Pierwszy z nich określa miejsce docelowe, do którego zostaną zapisane nasze logi, natomiast drugi pozwala na konfigurację poziomu i zakresu logowania. Taką konfigurację przygotować możemy na [wiele sposobów](https://logging.apache.org/log4j/2.x/manual/configuration.html), najprostszym będzie jednak wrzucenie pliku log4j2.xml na ścieżkę classpath, np. dołączając go do folderu resources.

Zobaczmy więc jak poprawnie skonfigurować zapisywanie logów do bazy danych MongoDB. Jest to dosyć ciekawa opcja, gdy nie możemy skorzystać z logowania do pliku. Baza ta oferuje zadowalające opcje indeksowania i filtrowania. Ponadto, jeśli jesteśmy limitowani planem hostingowym, szczególnie przydatne okażą się dwie funkcjonalności – czasowe indeksy TTL (Time To Live) i kolekcje o ograniczonym rozmiarze. W zależności od wymagań pozwoli nam to na zdefiniowanie limitu czasowego bądź maksymalnego rozmiaru przechowywanych logów.

<img src="/img/hq/mongodb-logs.png" alt="Zrzut ekranu z kolekcji logów z MongoDB" title="MongoDB – logi (przycięte)">

Przed rozpoczęciem warto zapoznać się z wersją MongoDB, do której będziemy się podłączać. Obecnie będzie to zazwyczaj wersja 3.x bądź 4.x, i to właśnie dla tych wersji *log4j2* oferuje obecnie wsparcie (chociaż możemy dodać własną implementację). Z bazą połączenie nawiążemy za pomocą sterownika. Kompatybilność wersji przedstawia [tabelka z dokumentacji bazy](https://docs.mongodb.com/drivers/java/).
Jeśli nie masz jeszcze żadnej zależności, to zalecana jest najnowsza wersja sterownika, ze względu na kompatybilność wstecz.

## Konfiguracja MongoDb4

Dodajemy zależności, w tym API *slf4j*, dzięki czemu będziemy mieli nieco mniej roboty w razie, gdybyśmy chcieli zmienić implementację logowania:

Gradle:

```groovy
  implementation 'org.slf4j:slf4j-api:1.7.30'
  implementation 'org.apache.logging.log4j:log4j-api:2.14.0'
  implementation 'org.apache.logging.log4j:log4j-core:2.14.0'
  implementation 'org.apache.logging.log4j:log4j-slf4j18-impl:2.14.0'
  implementation 'org.apache.logging.log4j:log4j-mongodb4:2.14.0'
  implementation 'org.mongodb:mongodb-driver-sync:4.1.1'
```

Maven:

```xml
  <dependency>
    <groupId>org.slf4j</groupId>
    <artifactId>slf4j-api</artifactId>
    <version>1.7.30</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-api</artifactId>
    <version>2.14.0</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>2.14.0</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-slf4j18-impl</artifactId>
    <version>2.14.0</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-mongodb4</artifactId>
    <version>2.14.0</version>
  </dependency>
  <dependency>
    <groupId>org.mongodb</groupId>
    <artifactId>mongodb-driver-sync</artifactId>
    <version>4.1.1</version>
  </dependency>
```

Podstawową konfigurację umieszczamy w pliku `src/main/resources/log4j2.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="trace" packages="dev.termian.tabula.gazella">
    <Appenders>
        <Console name="Console">
            <PatternLayout pattern="%d{HH:mm:ss.SSS}|%-5level|%t|%msg%n"/>
        </Console>
        <NoSql name="Mongo4">
            <MongoDb4 capped="true" collectionSize="104857600"
                              connection="mongodb://localhost:27017/admin.logs"
                              disabled="true"
            />
        </NoSql>
    </Appenders>
    <Loggers>
        <Root level="DEBUG">
            <AppenderRef ref="Console"/>
        </Root>
        <Logger name="my.package.name" level="DEBUG">
            <AppenderRef ref="Mongo4"/>
        </Logger>
    </Loggers>
</Configuration>
```

Standardowo tworzymy loggera przy pomocy slf4j i zapisujemy wiadomość:

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/***/

LoggerFactory.getLogger(getClass())
  .debug("Debug log")
```

I działa, ale czy na pewno? 

### Problem z logowaniem wyjątków

Podstawowa konfiguracja niestety nie wspiera logowania stacktrace. Próbując zalogować przykładowy wyjątek:

```java
    try {
        throw new RuntimeException("Test exception");
    } catch (Exception e) {
        logger.error("Logging the exception", e);
    }
```

otrzymujemy następujący błąd:
```plaintext
2020-11-29 17:43:41,239 vert.x-worker-thread-2 ERROR An exception occurred processing Appender Mongo4 org.apache.logging.log4j.core.appender.AppenderLoggingException: Unable to write to database in appender: Can't find a codec for class org.apache.logging.log4j.mongodb4.MongoDb4DocumentObject.
	at org.apache.logging.log4j.core.appender.db.AbstractDatabaseAppender.append(AbstractDatabaseAppender.java:118)
... 13 more
	at org.apache.logging.slf4j.Log4jLogger.error(Log4jLogger.java:313)
	at <my.package.name>
... 4 more
	at java.base/java.lang.Thread.run(Thread.java:832)
Caused by: org.bson.codecs.configuration.CodecConfigurationException: Can't find a codec for class org.apache.logging.log4j.mongodb4.MongoDb4DocumentObject.
	at org.bson.internal.CodecCache.getOrThrow(CodecCache.java:57)
	at org.bson.internal.ProvidersCodecRegistry.get(ProvidersCodecRegistry.java:64)
	at org.bson.internal.ChildCodecRegistry.get(ChildCodecRegistry.java:52)
```

Generalnie sterownik MongoDB pozwala na zapisanie do bazy różnych typów danych. Dla niestandardowych struktur musimy jednak zarejestrować klasę kodeku, który pozwoli na konwersję obiektu do formatu dokumentu, który jest podstawową strukturą, na której operuje baza. Przykładem takiego kodeku jest `org.apache.logging.log4j.mongodb4.MongoDb4LevelCodec` dostarczany przez *log4j*.

Logger opiera się natomiast o klasę `MongoDb4DocumentObject` implementującą interfejs `org.apache.logging.log4j.core.appender.nosql.NoSqlObject.NoSqlObject<org.bson.Document>`, który umożliwia stworzenie natywnego dokumentu, który zostanie zapisany w bazie. W przypadku logowania błędów, 
wewnątrz tego dokumentu, jako [stacktrace dodawane są obiekty `MongoDb4DocumentObject`](https://github.com/apache/logging-log4j2/blob/master/log4j-core/src/main/java/org/apache/logging/log4j/core/appender/nosql/NoSqlDatabaseManager.java#L134), które w procesie zapisu [nie są już konwertowane do dokumentu](https://github.com/apache/logging-log4j2/blob/master/log4j-mongodb4/src/main/java/org/apache/logging/log4j/mongodb4/MongoDb4DocumentObject.java#L42).

### Dodatkowa implementacja

Po zrozumieniu problemu, znalezienie rozwiązania jest dosyć proste. Możemy albo zarejestrować własny kodek dla klasy `MongoDb4DocumentObject`, albo doimplementować obsługę zagnieżdżonych obiektów w tej klasie.

Niestety ze względu na użycie modyfikatora `final` do obu rozwiązań będziemy potrzebowali przekopiować implementację dostarczaną przez *log4j2*. Na szczęście, zgodnie z [dokumentacją](https://logging.apache.org/log4j/2.x/manual/plugins.html), nasz nowy plugin zostanie bez problemu wykryty na ścieżce classpath i załadowany przez bibliotekę zakładając, że w konfiguracji odwołamy się do niego po nazwie.

Pierwsze rozwiązanie możemy zaaplikować, podmieniając listę kodeków w klasie `org.apache.logging.log4j.mongodb4.MongoDb4Provider`:
```java
private static final CodecRegistry CODEC_REGISTRIES = CodecRegistries.fromRegistries(
    // NEW:
        CodecRegistries.fromCodecs(new Codec<MongoDbDocumentObject>() {
            private Codec<Document> documentCodec = new DocumentCodec();

            @Override
            public void encode(BsonWriter writer, MongoDbDocumentObject value, EncoderContext encoderContext) {
                documentCodec.encode(writer, value.unwrap(), encoderContext);
            }

            @Override
            public Class<MongoDbDocumentObject> getEncoderClass() {
                return MongoDbDocumentObject.class;
            }

            @Override
            public MongoDbDocumentObject decode(BsonReader reader, DecoderContext decoderContext) {
                MongoDbDocumentObject object = new MongoDbDocumentObject();
                Document document = documentCodec.decode(reader, decoderContext);
                for (var entry : document.entrySet()) {
                    object.set(entry.getKey(), entry.getValue());
                }
                return object;
            }
        }),
    // OLD:
        CodecRegistries.fromCodecs(LevelCodec.INSTANCE),
        MongoClient.getDefaultCodecRegistry());
```

Drugie rozwiązanie to zmiana implementacji w `org.apache.logging.log4j.mongodb3.MongoDbDocumentObject`:

```java
    @Override
    public void set(final String field, final NoSqlObject<Document>[] values) {
        // OLD: this.document.append(field, Arrays.asList(values));
        // NEW:
        this.document.append(field, Arrays.asList(Arrays.stream(values).map(o -> o.unwrap()).collect(Collectors.toList())));
    }
```

Opcja druga wymaga jednak więcej pracy, gdyż nową klasę musimy podmienić również w `org.apache.logging.log4j.mongodb4.MongoDb4Connection` jak i w `org.apache.logging.log4j.mongodb4.MongoDb4Provider`. Po tym zabiegu logi powinny zacząć trafiać do naszej bazy.

## Konfiguracja MongoDb3

W przypadku sterownika w wersji 3 `org.mongodb:mongo-java-driver:3.12.7`, będziemy musieli skorzystać z odpowiedniej zależności ze strony *log4j2*, tj. `org.apache.logging.log4j:log4j-mongodb3:2.14.0`. Struktura tego modułu jest zasadniczo podobna do *MongoDb4*. Również tutaj będziemu musieli dokonać zmian kodeków w obrębie `org.apache.logging.log4j.mongodb3.MongoDbProvider`:

```plaintext
2020-11-29 16:30:18,245 vert.x-worker-thread-0 ERROR An exception occurred processing Appender Mongo3 org.apache.logging.log4j.core.appender.AppenderLoggingException: Unable to write to database in appender: Can't find a codec for class org.apache.logging.log4j.mongodb3.MongoDbDocumentObject.
	at org.apache.logging.log4j.core.appender.db.AbstractDatabaseAppender.append(AbstractDatabaseAppender.java:118)
... 13 more
	at org.apache.logging.slf4j.Log4jLogger.error(Log4jLogger.java:313)
	at <my.package.name>
... 4 more
	at java.base/java.lang.Thread.run(Thread.java:832)
Caused by: org.bson.codecs.configuration.CodecConfigurationException: Can't find a codec for class org.apache.logging.log4j.mongodb3.MongoDbDocumentObject.
	at org.bson.internal.CodecCache.getOrThrow(CodecCache.java:57)
	at org.bson.internal.ProvidersCodecRegistry.get(ProvidersCodecRegistry.java:64)
	at org.bson.internal.ChildCodecRegistry.get(ChildCodecRegistry.java:52)
... 65 more
```

## Podsumowanie

Pamiętaj aby nie pomieszać sterowników. Indykatorem takiej sytuacji mogą być następujące wyjątki:
```plaintext
Exception in thread "main" java.lang.NoSuchMethodError: 'void com.mongodb.client.internal.MongoClientDelegate.<init>(com.mongodb.connection.Cluster, org.bson.codecs.configuration.CodecRegistry, java.util.List, java.lang.Object, com.mongodb.client.internal.Crypt)'

Exception in thread "main" java.lang.NoSuchMethodError: 'void com.mongodb.internal.connection.DefaultClusterableServerFactory.<init>(com.mongodb.connection.ClusterId, com.mongodb.connection.ClusterSettings, com.mongodb.connection.ServerSettings, com.mongodb.connection.ConnectionPoolSettings, com.mongodb.connection.StreamFactory, com.mongodb.connection.StreamFactory, com.mongodb.MongoCredential, com.mongodb.event.CommandListener, java.lang.String, com.mongodb.MongoDriverInformation, java.util.List)'
```

Znając rozwiązanie tych problemów na pewno zaoszczędzisz trochę czasu na poprawnej konfiguracji logowania do bazy MongoDB. Dodatkowo, przeglądając klasy *MongoDb3Provider* i *MongoDb4Provider* zapoznasz się z budową pluginów *log4j2* i ich sposobem działania. Będzie to przydatne w innych przypadkach wymagających niestandardowej konfiguracji.