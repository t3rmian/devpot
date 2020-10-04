---
title: Vert.x Cassandra Client and DataStax Astra
url: vertx-cassandra-client-datastax-astra
id: 40
tags:
  - java
  - database
author: Damian Terlecki
date: 2020-10-04T20:00:00
---

DataStax Astra is a distribution of the NoSQL Apache Cassandra™ database based on the DBaaS (Database as a Service) model. Extended with a GraphQL interface and REST API, it is a very interesting product that should be taken into account when choosing a database for the application. Since May 2020, we can try out this solution for free (10 GB in the Google cloud).

If we want to build an application based on Vert.x, we can use the [io.vertx:vertx-cassandra-client](https://vertx.io/docs/vertx-cassandra-client/java/) module. We are quite lucky since this module uses DataStax drivers', however, the dependency version is quite old and we might encounter some difficulties setting up a connection to the database. If we are not interested in connecting via drivers, we can of course use the HTTP communication.

## Connection to the database

After [creating the database](https://astra.datastax.com/register) and clicking on the connect button, we get the option to download the package needed for a secure connection to the database. The package includes TLS certificates and the location of our base. In [the documentation](https://docs.astra.datastax.com/docs/migrating-your-datastax-java-driver-to-connect-with-astra-databases), we will quickly find a sample code required to establish such a connection.

<img src="/img/hq/datastax-astra-connection.png" alt="DataStax Astra – Connection methods page" title="DataStax Astra – Connection methods page">

The current version of vertx-cassandra-client (3.9.x) uses the DataStax drivers version 3.5.0. Unfortunately, the method for configuring the connection to the database (withCloudSecureConnectBundle) described in the documentation using the file provided by DataStax was added in version 3.8.0. We have to upgrade the driver version, as the newer Vert.x version 4.0 (beta) does not solve this issue yet.

<table class="rwd">
   <thead>
      <tr>
         <th>Vert.x</th>
         <th>Vert.x driver dependency</th>
         <th>withCloudSecureConnectBundle</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Vert.x">io.vertx:vertx-cassandra-client:3.9.3</td>
         <td data-label="Vert.x driver dependency">com.datastax.cassandra:cassandra-driver-core:3.5.0</td>
         <td data-label="withCloudSecureConnectBundle">com.datastax.cassandra:cassandra-driver-core:3.8.0+</td>
      </tr>
      <tr>
         <td data-label="Vert.x">io.vertx:vertx-cassandra-client:4.0.0-milestone5</td>
         <td data-label="Vert.x driver dependency">com.datastax.oss:java-driver-core:4.2.2</td>
         <td data-label="withCloudSecureConnectBundle">com.datastax.oss:java-driver-core:4.3.0+</td>
      </tr>
    </tbody>
</table>

## Dependency configuration

In the case of Vert.x, aside from upgrading the minor version of driver 3.x, it's also necessary to downgrade the guava module version from 25.1-jre (used by Vert.x) to 19.0 (used by the driver). This way we will avoid the following error:

```plaintext
java.lang.NoSuchMethodError: 'java.lang.String com.google.common.net.HostAndPort.getHostText()'
	at com.datastax.driver.core.CloudConfigFactory.getSniProxyAddress(CloudConfigFactory.java:232)
	at com.datastax.driver.core.CloudConfigFactory.createCloudConfig(CloudConfigFactory.java:119)
	at com.datastax.driver.core.Cluster$Builder.withCloudSecureConnectBundle(Cluster.java:1456)
```

For Gradle based build, we will do this by configuring the application dependencies in the standard `build.gradle` file:

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

For Maven `pom.xml`, it will look something like this:

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

## The code

Generally, this configuration should be sufficient to establish a connection in version 3.x (Vert.x/driver). After placing the configuration package in the resources folder and providing the login and password, we will be able to create a client. With this client which we can run queries against the Astra DataStax database.

```java
CassandraClientOptions options = new CassandraClientOptions(Cluster.builder()
        .withCloudSecureConnectBundle(Thread.currentThread().getContextClassLoader().getResourceAsStream("secure-connect-<db_name>.zip"))
        .withAuthProvider(new PlainTextAuthProvider(config.getString("cassandra.login"), config.getString("cassandra.password"))));

CassandraClient client = CassandraClient.create(vertx, options);
```

A similar procedure, most likely without excluding Guava, is also required for the current, 4.x version. Of course assuming, that the interface of the latest 4.3+ driver is backward compatible with the 4.2.2 driver used by Vert.x beta milestone 5. I haven't tested this yet for the beta version, but you could give it a try!
