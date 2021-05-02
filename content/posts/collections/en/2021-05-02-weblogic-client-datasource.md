---
title: WebLogic client Data Source lookup
url: weblogic-client-data-source-lookup
id: 65
tags:
  - java
  - weblogic
  - database
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

When creating an application in EJB technology for WebLogic servers, access to the database is usually performed through the EJB beans.
Sometimes, however, from the SE client point of view, we may need some direct access to the database, e.g. to verify our system or integration tests.

The basic element providing the connection to the database is the Data Source configured on WebLogic.
We can always find a reference to the Data Source via InitialContext or the `@Resource` annotation, assuming that we are in a container-managed seed.

## WebLogic 12.x client DataSource

However, to obtain a reference to the DataSource managed by the WebLogic 12.x server from the client level, 
there are some additional prerequisites. We will need the *wlfullclient.jar* library.
By default, this library cannot be found in the Maven repository, and we have to build it on our own, from the WebLogic installation directory.
How to build the library is described in [the documentation](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D):
1. Find the `WL_HOME/server/lib` directory.
2. Build the library: `java -jar wljarbuilder.jar`.
3. Add the library to the classpath. Apart from playing with the `-cp` parameters, we can install it in a local repository and add it to Maven dependencies:
```bash
mvn install:install-file -Dfile=wlfullclient.jar -DgroupId=com.oracle -DartifactId=wlfullclient -Dversion=12.2.1.4 -Dpackaging=jar
```
```xml
<dependency>
    <groupId>com.oracle</groupId>
    <artifactId>wlfullclient</artifactId>
    <version>12.2.1.4</version>
    <scope>test</scope>
</dependency>
```

If you do not need stubs such as DataSource and are satisfied with basic EJB communication, you can use the *wlthint3client.jar* library from the same directory.
Obtaining the reference looks pretty standard and is done through the InitialContext. As a context factory, we specify a WebLogic-specific factory.
This class comes from the attached libraries.

```java
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Properties;

import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.Assert.assertTrue;

public class DatabaseIT {
    private final InitialContext context;
    private final DataSource dataSource;
    private final MyEjbService service;

    public DatabaseIT() throws NamingException {
        Properties env = new Properties();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory");
        env.put(Context.PROVIDER_URL, "t3://localhost:7001");
        context = new InitialContext(env);
        dataSource = (DataSource) context.lookup("my.datasource.jndi");
        service = (MyEjbService) context.lookup("my.ejb.service.jndi");
    }

    @Test
    public void testConnection() throws SQLException {
        service.foo();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM DUAL");
             ResultSet resultSet = statement.executeQuery()) {
            assertTrue(resultSet.next());
            assertThat(resultSet.getString(1), equalTo("X"));
        }
    }
}
```

Our integration test, or rather a system test, should finish successfully.
You can find the proper JNDI name in the WebLogic console, by finding the connection configuration in the *Services -> Data Sources* tree:

<img src="/img/hq/wlfullclient-test.png" alt="DataSource JNDI" title="DataSource JNDI">

Without the *wlfullclient.jar* library, we shouldn't be surprised by the following error when trying to get a reference to DataSource:
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

Furthermore, without any client library, we will not initialize the context due to the lack of *weblogic.jndi.WLInitialContextFactory*:
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## WebLogic 14.x client DataSource

The *wlfullclient.jar* library was already **deprecated** in version 12.2.1.3.
Now in version 14.1.1.0 we won't find the *wljarbuilder.jar*, so we won't be able to build *wlfullclient.jar* anymore.
We can use the *wlfullclient.jar* package built from one of the previous versions and hope for undocumented compatibility with version 14.1.1.0.

For example, using packages from versions 12.2.1.3 or 12.2.1.4, our test will pass without a problem, but with 12.1.3 we will get an error during the initialization of the context:
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

A more compatible solution is to find libraries containing the necessary classes in the *WL_HOME/modules* directory.
It is from this directory among others that *wljarbuilder.jar* builds *wlfullclient.jar* in previous versions.
We can use the following command to find the classes we need:

```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- the DataSource class will be found in *WL_HOME/modules/com.bea.core.datasource6.jar*.

Following the bread crumbs of new stack traces, we will find the missing classes:
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

These 3 packages and *wlthint3client.jar* will allow you to get a reference to DataSource managed by a WebLogic 14.1.1.0 from the client (Java SE), and successfully query the database.
If your container requires an authenticated connection, don't forget to set up the credentials through the `Context.SECURITY_PRINCIPAL` and `Context.SECURITY_CREDENTIALS` InitialContext properties.
