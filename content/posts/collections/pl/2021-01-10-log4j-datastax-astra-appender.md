---
title: Jak skonfigurować logowanie do Datastax Astra przy pomocy log4j2
url: log4j2-cassandra-datastax-astra-appender
id: 47
tags:
  - java
  - bazy danych
author: Damian Terlecki
date: 2021-01-10T20:00:00
---

Zapisywanie logów do bazy Cassandra przy pomocy *log4j2* to bułka z masłem. DataStax Astra, czyli rozwiązanie znane jako Cassandra-as-a-Service, pozwala na połączenie się z bazą za pomocą swego rodzaju paczki konfiguracyjnej. Wewnątrz niej znajdują się nie tylko namiary na bazę, ale również niezbędne certyfikaty do bezpiecznego połączenia.

<img src="/img/hq/datastax-astra-connect-bundle.png" alt="Obrazek przedstawiajacy zawartość paczki ułatwiającej konfigurację połączenia z Datastax Astra" title="Connection Bundle">

Ogólnie rzecz biorąc, możemy oczywiście rozpakować tę paczkę i zaimportować certyfikaty do standardowego keystore/truststore. W ten sposób będziemy w stanie użyć standardowego appendera *log4j2* dla Cassandry. Możemy również nieco zmodyfikować appender dostarczany przez *log4j2* i dostosować go do konfiguracji połączenia zainicjalizowanego przy pomocy dostarczonej paczki. Aby jednak nie zaśmiecać standardowej konfiguracji, zobaczmy, jak wygląda opcja druga.


## Datastax Astra log4j2 Appender

Naszą implementację zaczniemy od utworzenia podstawowej tabeli z logami. W celu dobrej skalowalności zazwyczaj model w przypadku Cassandy powinien być stworzony po analizie zapytań, jakie będziemy wysyłać do niej wysyłać. Warto również wspomnieć, że baza wspiera konfigurację czasu TTL (DEFAULT_TIME_TO_LIVE) przedawnienia (usunięcia) rekordów. Wracając do tematu, standardowa tabelka z logami wygląda tak:

```sql
--DROP TABLE IF EXISTS your_keyspace.logs;
CREATE TABLE your_keyspace.logs
(
    id        timeuuid PRIMARY KEY,
    timeid    timeuuid,
    message   text,
    level     text,
    marker    text,
    logger    text,
    timestamp timestamp,
    mdc       map<text,text>,
    ndc       list<text>
);
```

### Zależności

Standardowo, zaciągniemy API *slf4j* oraz podstawowe zależności *log4j* wraz ze sterownikiem.

Gradle:
```xml
    implementation 'org.slf4j:slf4j-api:1.7.30'

    implementation 'org.apache.logging.log4j:log4j-api:2.14.0'
    implementation 'org.apache.logging.log4j:log4j-core:2.14.0'
    implementation 'org.apache.logging.log4j:log4j-slf4j18-impl:2.14.0'
    implementation 'org.apache.logging.log4j:log4j-cassandra:2.14.0'

    implementation 'com.datastax.cassandra:cassandra-driver-core:3.10.2'
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
    <artifactId>log4j-cassandra</artifactId>
    <version>2.14.0</version>
  </dependency>

  <dependency>
    <groupId>com.datastax.cassandra</groupId>
    <artifactId>cassandra-driver-core</artifactId>
    <version>3.10.2</version>
  </dependency>
```

Implementację standardowego appendera wraz z pozostałymi klasami znajdziemy pod następującymi ścieżkami:
- *org.apache.logging.log4j.cassandra.CassandraAppender*;
- *org.apache.logging.log4j.cassandra.CassandraManager*;
- *org.apache.logging.log4j.cassandra.ClockTimestampGenerator*.

### Własny appender

Podstawowy appender potrzebuje dostarczenia informacji na temat adresów, nazwy klastra i flagi określającej czy połączenie będzie po TLS.
W naszym przypadku dane te zostaną zasilone z paczki konfigurującej połączenie. Na bazie *CassandraAppender*, tworzymy własnego appendera i usuwamy
następujące parametry buildera:

```java
        @PluginElement("ContactPoints")
        @Required(message = "No Cassandra servers provided")
        private SocketAddress[] contactPoints = new SocketAddress[]{SocketAddress.getLoopback()};
        
        @PluginBuilderAttribute
        private boolean useTls;
        
        @PluginBuilderAttribute
        @Required(message = "No cluster name provided")
        private String clusterName;
```

Zamiast nich dodajemy własny parametr (opcjonalnie – bo możemy zakodować go na stałe), `connectBundle`, który będzie nazwą paczki konfiguracyjnej dołączonej do ścieżki classpath. Komentarze w poniższych kawałkach kodu oznaczają, że znajdują się tam logika z oryginalnych klas:

```java
@Plugin(name = "ExtendedCassandra", category = Core.CATEGORY_NAME, elementType = ExtendedCassandraAppender.ELEMENT_TYPE, printObject = true)
public class ExtendedCassandraAppender extends AbstractDatabaseAppender<ExtendedCassandraManager> {

    /***/

    public static class Builder<B extends Builder<B>> extends AbstractAppender.Builder<B>
            implements org.apache.logging.log4j.core.util.Builder<ExtendedCassandraAppender> {

    /***/

        @PluginBuilderAttribute
        @Required(message = "No connection bundle provided")
        private String connectBundle;

        @Override
        public ExtendedCassandraAppender build() {
            final ExtendedCassandraManager manager = ExtendedCassandraManager.getManager(getName(), connectBundle, columns,
                    keyspace, table, username, password, useClockForTimestampGenerator, bufferSize, batched,
                    batchType);
            return new ExtendedCassandraAppender(getName(), getFilter(), isIgnoreExceptions(), null, manager);
        }
    }
}
```


Następnie na podobnej zasadzie modyfikujemy klasę *CassandraManager*, usuwając zbędne parametry. Na początku metody `createManager()` inicjalizujemy klaster przy użyciu paczki:
```java
public class ExtendedCassandraManager extends AbstractDatabaseManager {

    /***/

    public static ExtendedCassandraManager getManager(final String name, final String connectBundle,
                                                      final ColumnMapping[] columns, final String keyspace, final String table,
                                                      final String username, final String password,
                                                      final boolean useClockForTimestampGenerator, final int bufferSize,
                                                      final boolean batched, final BatchStatement.Type batchType) {
        return getManager(name,
                new FactoryData(connectBundle, columns, keyspace, table, username, password,
                        useClockForTimestampGenerator, bufferSize, batched, batchType), CassandraManagerFactory.INSTANCE);
    }

    private static class FactoryData extends AbstractFactoryData {
        private final ColumnMapping[] columns;
        private final String keyspace;
        private final String table;
        private final String username;
        private final String password;
        private final String connectBundle;
        private final boolean useClockForTimestampGenerator;
        private final boolean batched;
        private final BatchStatement.Type batchType;

        private FactoryData(final String connectBundle, final ColumnMapping[] columns,
                            final String keyspace, final String table, final String username,
                            final String password, final boolean useClockForTimestampGenerator, final int bufferSize,
                            final boolean batched, final BatchStatement.Type batchType) {
            super(bufferSize, null);
            this.connectBundle = connectBundle;
            this.columns = columns;
            this.keyspace = keyspace;
            this.table = table;
            this.username = username;
            this.password = password;
            this.useClockForTimestampGenerator = useClockForTimestampGenerator;
            this.batched = batched;
            this.batchType = batchType;
        }

    }

    private static class CassandraManagerFactory implements ManagerFactory<ExtendedCassandraManager, ExtendedCassandraManager.FactoryData> {

        private static final ExtendedCassandraManager.CassandraManagerFactory INSTANCE = new ExtendedCassandraManager.CassandraManagerFactory();

        @Override
        public ExtendedCassandraManager createManager(final String name, final FactoryData data) {
            final Cluster.Builder builder = Cluster.builder()
                    .withCloudSecureConnectBundle(Thread.currentThread().getContextClassLoader().getResourceAsStream(data.connectBundle))
                    .withAuthProvider(new PlainTextAuthProvider(data.username, data.password));
            if (data.useClockForTimestampGenerator) {
                builder.withTimestampGenerator(new ClockTimestampGenerator());
            }
            final Cluster cluster = builder.build();

            final StringBuilder sb = new StringBuilder("INSERT INTO ").append(data.table).append(" (");
            for (final ColumnMapping column : data.columns) {
                sb.append(column.getName()).append(',');
            }
            sb.setCharAt(sb.length() - 1, ')');
            sb.append(" VALUES (");
            final List<ColumnMapping> columnMappings = new ArrayList<>(data.columns.length);
            for (final ColumnMapping column : data.columns) {
                if (Strings.isNotEmpty(column.getLiteralValue())) {
                    sb.append(column.getLiteralValue());
                } else {
                    sb.append('?');
                    columnMappings.add(column);
                }
                sb.append(',');
            }
            sb.setCharAt(sb.length() - 1, ')');
            final String insertQueryTemplate = sb.toString();
            LOGGER.debug("Using CQL for appender {}: {}", name, insertQueryTemplate);
            return new ExtendedCassandraManager(name, data.getBufferSize(), cluster, data.keyspace, insertQueryTemplate,
                    columnMappings, data.batched ? new BatchStatement(data.batchType) : null);
        }
    }
```

Dla porównania, w standardowej klasie, klaster jest inicjalizowany następująco:

```java
            final Cluster.Builder builder = Cluster.builder()
                .addContactPointsWithPorts(data.contactPoints)
                .withClusterName(data.clusterName);
            if (data.useTls) {
                builder.withSSL();
            }
            if (Strings.isNotBlank(data.username)) {
                builder.withCredentials(data.username, data.password);
            }
            if (data.useClockForTimestampGenerator) {
                builder.withTimestampGenerator(new ClockTimestampGenerator());
            }
            final Cluster cluster = builder.build();
```

Konfigurację kończymy, definiując nasz nowy appender w pliku `log4j2.xml`, umieszczonym w classpath (zazwyczaj wrzucając go w folder `src/main/resources`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="trace" packages="dev.termian.tabula.gazella">
    <Appenders>
        <Console name="Console">
            <PatternLayout pattern="%d{HH:mm:ss.SSS}|%-5level|%t|%msg%n"/>
        </Console>
        <ExtendedCassandra name="Cassandra" keyspace="your_keyspace" table="logs"
                           bufferSize="10" batched="true"
                           connectBundle="secure-connect-bundle.zip"
                           username="${env:cassandra.username}" password="${env:cassandra.password}"
        >
            <ColumnMapping name="id" pattern="%uuid{TIME}" type="java.util.UUID"/>
            <ColumnMapping name="timeid" literal="now()"/>
            <ColumnMapping name="message" pattern="%message"/>
            <ColumnMapping name="level" pattern="%level"/>
            <ColumnMapping name="marker" pattern="%marker"/>
            <ColumnMapping name="logger" pattern="%logger"/>
            <ColumnMapping name="timestamp" type="java.util.Date"/>
            <ColumnMapping name="mdc" type="org.apache.logging.log4j.spi.ThreadContextMap"/>
            <ColumnMapping name="ndc" type="org.apache.logging.log4j.spi.ThreadContextStack"/>
        </ExtendedCassandra>
    </Appenders>
    <Loggers>
        <Root level="DEBUG">
            <AppenderRef ref="Console"/>
        </Root>
        <Logger name="dev" level="DEBUG">
            <AppenderRef ref="Cassandra"/>
        </Logger>
    </Loggers>
</Configuration>
```

Odpalamy aplikację i logi powinny zacząć trafiać do naszej bazy Astra:

```java
    try {
        throw new RuntimeException("Test exception");
    } catch (Exception e) {
        LoggerFactory.getLogger(getClass())
              .error("Failed to load source", e);
    }
```

<img src="/img/hq/datastax-astra-logs.png" alt="Zrzut ekranu przedstawiający logi zapisane w bazie Astra" title="Astra – zapisane logi">