---
title: How to configure log4j2 MongoDB appender
url: log4j2-mongodb-appender
id: 44
tags:
  - java
  - database
author: Damian Terlecki
date: 2020-11-29T20:00:00
---

The basic configuration of the *log4j2* logging library is based on two elements: Appender and Logger. The first one determines the destination to which our logs will be saved, while the second allows you to configure the level and scope of logging. We can do this in [various ways](https://logging.apache.org/log4j/2.x/manual/configuration.html), but the easiest one is to put the log4j2.xml file onto the classpath path, e.g. by placing it in the resources folder.

Let's see then, how to properly configure logging to the MongoDB database. It is quite an interesting option when we cannot use the filesystem logging. This database offers satisfactory indexing and filtering options. In addition, if we are limited by a hosting plan, two features will be particularly useful – TTL (Time To Live) indexes and limited-size collections. Depending on the requirements, it will allow us to define the time limit or the maximum size of the stored logs.

<img src="/img/hq/mongodb-logs.png" alt="A screenshot of the MongoDB log collection" title="MongoDB – logs (trimmed)">

Before starting, it is worth familiarizing yourself with the version of MongoDB that we will be connecting to. Currently, it will usually be 3.x or 4.x, and for these versions, *log4j2* currently provides support (although we can add our own implementation). We will establish a connection with the base using a driver. Driver version compatibility is shown in a [table from the database documentation](https://docs.mongodb.com/drivers/java/).
If you don't have any specific dependency requirement, I suggest choosing the latest driver version as it is backward compatible.

## MongoDb4 configuration

We will start with adding dependencies, including *slf4j* API. This way we'll have a bit less work in case we want to change the login implementation:

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

The basic configuration from `src/main/resources/log4j2.xml` file:

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

Next, we create a logger through the *slf4j* API and save the message:

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/***/

LoggerFactory.getLogger(getClass())
  .debug("Debug log")
```

Finally, it works! But does it really?

### Problem with exceptions logging

The basic configuration, unfortunately, does not support stack trace logging. Trying to log a sample exception:

```java
    try {
        throw new RuntimeException("Test exception");
    } catch (Exception e) {
        logger.error("Logging the exception", e);
    }
```

causes a following error:
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

Generally, the MongoDB driver allows different types of data to be written to the database. For non-standard structures, however, we need to register a codec class that will allow conversion of the log objects to the document format, which is the basic structure of the DB. An example of such a codec is the `org.apache.logging.log4j.mongodb4.MongoDb4LevelCodec` provided by *log4j*.

The logger is based on the `MongoDb4DocumentObject` class that implements the `org.apache.logging.log4j.core.appender.nosql.NoSqlObject.NoSqlObject <org.bson.Document>` interface. This allows you to create a native document that will be saved in the database. In case of errors logging,
 `MongoDb4DocumentObject` objects are added as [stacktrace](https://github.com/apache/logging-log4j2/blob/master/log4j-core/src/main/java/org/apache/logging/log4j/core/appender/nosql/NoSqlDatabaseManager.java#L134), which are [not converted](https://github.com/apache/logging-log4j2/blob/master/log4j-mongodb4/src/main/java/org/apache/logging/log4j/mongodb4/MongoDb4DocumentObject.java#L42) into a document during the saving process.

### Additional implementation

After understanding the problem, finding a solution is fairly easy. We can either register our own codec for the `MongoDb4DocumentObject` class, or implement support for nested objects in this class.

Unfortunately, due to the use of the `final` modifier for both solutions, we will need to copy the implementation provided by *log4j2*. Fortunately, according to [documentation](https://logging.apache.org/log4j/2.x/manual/plugins.html), our new plugin will be easily detected on the classpath path and loaded by the library, assuming that in configuration we will refer to it by its name.

We can apply the first solution by replacing the list of codecs in the `org.apache.logging.log4j.mongodb4.MongoDb4Provider` class:
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

The second solution is to change the implementation in the `org.apache.logging.log4j.mongodb3.MongoDbDocumentObject`:

```java
    @Override
    public void set(final String field, final NoSqlObject<Document>[] values) {
        // OLD: this.document.append(field, Arrays.asList(values));
        // NEW:
        this.document.append(field, Arrays.asList(Arrays.stream(values).map(o -> o.unwrap()).collect(Collectors.toList())));
    }
```

The second option, however, requires more work, because the new class must also be replaced in `org.apache.logging.log4j.mongodb4.MongoDb4Connection` and in` org.apache.logging.log4j.mongodb4.MongoDb4Provider`. After this treatment, the logs should appear in our database.

## MongoDb3 configuration

For version 3 of the driver `org.mongodb: mongo-java-driver: 3.12.7`, we will have to use the corresponding dependency from the *log4j2* appenders, i.e. `org.apache.logging.log4j:log4j-mongodb3:2.14.0`. The structure of this module is essentially similar to *MongoDb4*. Note that, we will have to make the codec changes within `org.apache.logging.log4j.mongodb3.MongoDbProvider` as well:

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

## Summary

Remember not to mix up the drivers as it will cause conflicts. The following exceptions may be an indicator of such a situation:
```plaintext
Exception in thread "main" java.lang.NoSuchMethodError: 'void com.mongodb.client.internal.MongoClientDelegate.<init>(com.mongodb.connection.Cluster, org.bson.codecs.configuration.CodecRegistry, java.util.List, java.lang.Object, com.mongodb.client.internal.Crypt)'

Exception in thread "main" java.lang.NoSuchMethodError: 'void com.mongodb.internal.connection.DefaultClusterableServerFactory.<init>(com.mongodb.connection.ClusterId, com.mongodb.connection.ClusterSettings, com.mongodb.connection.ServerSettings, com.mongodb.connection.ConnectionPoolSettings, com.mongodb.connection.StreamFactory, com.mongodb.connection.StreamFactory, com.mongodb.MongoCredential, com.mongodb.event.CommandListener, java.lang.String, com.mongodb.MongoDriverInformation, java.util.List)'
```

Knowing the solution to these problems, you will definitely save some time on preparing the correct configuration for MongoDB appender. Additionally, by analysing the *MongoDb3Provider* and *MongoDb4Provider* classes, you will learn about the structure of *log4j2* plugins and their way of working. This will prove to be useful in other cases that would require custom configuration.