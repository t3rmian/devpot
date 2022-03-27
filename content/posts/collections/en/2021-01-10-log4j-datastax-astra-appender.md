---
title: How to configure log4j2 Datastax Astra (Cassandra) appender
url: log4j2-cassandra-datastax-astra-appender
id: 47
category:
  - java: Java
tags:
  - logs
  - cassandra
author: Damian Terlecki
date: 2021-01-10T20:00:00
---

Saving logs to a Cassandra database with *log4j2* is a piece of cake. DataStax Astra, a solution known as Cassandra-as-a-Service, allows you to connect to the database using an archive called connect bundle. Inside, you will find not only the addresses of the cluster but also the necessary certificates for a secure connection.

<img src="/img/hq/datastax-astra-connect-bundle.png" alt="A picture showing the contents of the package containing the configuration of the secure connection with Datastax Astra" title="Secure Connect Bundle">

Of course, this bundle can be unpacked and we can import the certificates into the standard keystore/truststore. This way we should be able to use the standard *log4j2* appender for Cassandra. We can also slightly modify the appender provided by *log4j2* and adapt it to accept the secure connect bundle instead. In order not to clutter the standard JVM configuration, let's talk about the latter option.

## Datastax Astra log4j2 Appender

We will start our configuration by creating a simple table to store the logs. For good scalability in the case of Cassandra, the model should usually be created after analyzing what queries we will perform. It is also worth mentioning that the database supports the configuration of records TTL (DEFAULT_TIME_TO_LIVE), which might be perfect if you don't need to store the logs forever. Back to the topic, the basic table with logs can look like this:

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

### Dependencies

As always, we will be logging through the *slf4j* API. Along with the basic *log4j* dependencies, a Cassandra driver is also required.

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

The logic required for the standard Cassandra appender can be found under the following classes:
- *org.apache.logging.log4j.cassandra.CassandraAppender*;
- *org.apache.logging.log4j.cassandra.CassandraManager*;
- *org.apache.logging.log4j.cassandra.ClockTimestampGenerator*.

### Writing your own appender

When using the basic appender, we need to provide information about addresses, cluster name, and a flag specifying whether it will be a secure connection.
In our case, this data will be supplied from the connection bundle. Based on *CassandraAppender*, we will create our own appender and delete
the following builder parameters from the original source:

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

We replace these parameters with a single `connectBundle` (optionally – because we could also hardcode it). It will stand for the name of the configuration package attached to the classpath. The comments in the following code snippets indicate that the logic from the original classes is left intact:

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

Then we modify the *CassandraManager* class in a similar way, removing unnecessary parameters. At the beginning of the `createManager()` method we initialize the cluster using the secure connect bundle:

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

For comparison, in the original appender, a cluster is initialized in the following way:

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

The configuration can be finished by defining the new appender in the `log4j2.xml` file. This file should be placed in the classpath (usually it's dropped into the `src/main/resources` folder):

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

Now all that's left is to run our application, and the logs should appear in the Astra database:

```java
    try {
        throw new RuntimeException("Test exception");
    } catch (Exception e) {
        LoggerFactory.getLogger(getClass())
              .error("Failed to load source", e);
    }
```

<img src="/img/hq/datastax-astra-logs.png" alt="Screenshot showing logs saved in Astra database" title="Astra logs">