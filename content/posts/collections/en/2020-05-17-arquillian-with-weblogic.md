---
title: Running integration tests with Arquillian on WebLogic
url: arquillian-with-weblogic
id: 30
tags:
  - java
  - weblogic
  - testing
  - intellij
author: Damian Terlecki
date: 2020-05-17T20:00:00
---

Setting up and writing your first tests with Arquillian is not that quick as with Spring Boot. Nevertheless, sometimes you've got to use what you can (Java EE). Let's take a look for some common problems when configuring the tests for WebLogic 12.2, which is a JEE 7 application server that has been with us for over 5 years (14.1 with the support for Java EE 8 was just released on March).

The first thing we need to know in regards to WebLogic 12.2, is that it's not quite compatible with the current version of Arquillian dependencies. The most recent versions will work fine with WebLogic 12.1. However, we can more-or-less use 12.1 to run our tests and connect to the 12.2 remote container.

## Dependencies

We will use Maven as it is probably most popular build tool for Java EE projects.
For starters we will need the dependencies to integrate our tests with JUnit4:
```xml
<dependency>
  <groupId>org.jboss.arquillian.junit</groupId>
  <artifactId>arquillian-junit-container</artifactId>
  <scope>test</scope>
</dependency>
```

Next we need to choose what kind of EJBContainer provider we will use. Will it be:
- an embedded container that runs in the same JVM (not preferred, may act inconsistently, takes time for startup);
- a managed container which is like a remote container, but the lifecycle is managed by Arquillian;
- a remote container that resides in a separate JVM?

```xml
<dependency>
  <groupId>org.jboss.arquillian.container</groupId>
<!--  <artifactId>arquillian-wls-embedded-12.1</artifactId>-->
<!--  <artifactId>arquillian-wls-managed-12.1</artifactId>-->
  <artifactId>arquillian-wls-remote-12.1</artifactId>
  <version>1.0.1.Final</version>
  <scope>test</scope>
</dependency>
```

## Embedded container

You might encounter some problems with this approach at a later point. If you are considering testing something more complex, you should know the [danger of embedded containers](http://arquillian.org/blog/2012/04/13/the-danger-of-embedded-containers/).

### Maven

Now if you want to use the embedded container, you will also need to provide the path to the container on the classpath. This can be done through `additionalClasspathElements` property of the maven surefire (unit testing) or failsafe (integration testing) plugin. Put this in your build configuration within plugins section.

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-failsafe-plugin</artifactId>
  <version>2.17</version>
  <executions>
    <execution>
      <goals>
        <goal>integration-test</goal>
      </goals>
    </execution>
  </executions>
  <configuration>
    <skip>false</skip>
    <!-- Disable assertions otherwise an assertionerror involving the WLS management runtime is thrown -->
    <enableAssertions>false</enableAssertions>
    <classpathDependencyExcludes>
      <classpathDependencyExcludes>javax:javaee-api</classpathDependencyExcludes>
    </classpathDependencyExcludes>
    <additionalClasspathElements>
      <!-- This requires setting WL_HOME environment variable e.g.: C:/Ora/wlserver/ -->
      <additionalClasspathElement>${env.WL_HOME}/server/lib/weblogic.jar</additionalClasspathElement>
    </additionalClasspathElements>
  </configuration>
</plugin>
```

With this configuration we can run integration tests using `mvn verify` command.

### IntelliJ

Running tests from the IDE can be very handy. In this case, IntelliJ provides great support and seems to also bundle the embedded container.
All you need to do is to set up the run configuration. Select Arquillian JUnit and in the container menu, add an embedded configuration.

<figure style="text-align: center;">
<img loading="lazy" style="display: inline; margin-bottom: 0;" src="/img/hq/arquillian-intellij-configuration.png" alt="Arquillian test run configuration" title="Arquillian test run configuration">
<img loading="lazy" style="display: inline; margin-bottom: 0;" src="/img/hq/arquillian-intellij-configure.png" alt="Arquillian container configuration" title="Arquillian container configuration">
<img loading="lazy" style="margin-top: 0;" src="/img/hq/arquillian-intellij-container.png" alt="Adding Arquillian container" title="Adding Arquillian container">
</figure>

With almost no effort you should now be able to execute (`CTRL+SHIFT+F10`) a selected test.

## Managed and remote containers

These two configurations are managed by `src/test/resources/arquillian.xml` file. An example configuration with `WL_HOME` pointing to the 12.1 version:

```xml
<?xml version="1.0"?>
<arquillian xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://jboss.org/schema/arquillian"
  xsi:schemaLocation="http://jboss.org/schema/arquillian http://jboss.org/schema/arquillian/arquillian_1_0.xsd">

  <engine>
    <property name="deploymentExportPath">target/</property>
  </engine>

  <container qualifier="wls-managed">
    <configuration>
      <!-- optional if env variable WL_HOME is set -->
      <property name="wlHome">C:/Ora/wlserver</property>
      <!-- path to your domain -->
      <property name="domainDirectory">C:/Ora/wlserver/user_projects/domains/base_domain/</property>
      <property name="adminUrl">t3://localhost:7001</property>
      <property name="adminUserName">weblogic</property>
      <property name="adminPassword">weblogic12#</property>
      <property name="target">AdminServer</property>
    </configuration>
  </container>

  <container qualifier="wls-remote" default="true">
    <configuration>
      <!-- optional if env variable WL_HOME is set -->
      <property name="wlHome">C:/Ora/wlserver</property>
      <property name="adminUrl">t3://localhost:7001</property>
      <property name="adminUserName">weblogic</property>
      <property name="adminPassword">weblogic12#</property>
      <property name="target">AdminServer</property>
    </configuration>
  </container>
</arquillian>
```

The qualifier name can be optionally used to select the container configuration either through the configuration of the maven surefire/failsafe plugin:
```xml
<configuration>
    <skip>true</skip>
    <systemProperties>
        <arquillian.launch>wls-managed</arquillian.launch>
    </systemProperties>
</configuration>
```
This can also be defined in the Arquillian Container configuration in the IntelliJ:

<img loading="lazy" src="/img/hq/arquillian-intellij-qualifier.png" alt="Arquillian container qualifier" title="Arquillian container qualifier">

## Simple test case

To verify that our configuration is working properly we can create a simplest bean:

```java
import javax.ejb.Stateless;

@Stateless
public class Greeter {
    public String greet() {
        return "Hello world";
    }
}
```

… and the test case:

```java
import static org.hamcrest.core.IsEqual.equalTo;
import static org.hamcrest.core.IsNull.notNullValue;
import static org.junit.Assert.assertThat;


import javax.ejb.EJB;
import org.jboss.arquillian.container.test.api.Deployment;
import org.jboss.arquillian.junit.Arquillian;
import org.jboss.shrinkwrap.api.Archive;
import org.jboss.shrinkwrap.api.ShrinkWrap;
import org.jboss.shrinkwrap.api.spec.JavaArchive;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(Arquillian.class)
public class GreeterIT {

    @EJB
    private Greeter greeter;

    @Deployment
    public static Archive<?> getTestArchive() {
        final JavaArchive jar = ShrinkWrap.create(JavaArchive.class, "test.jar")
                .addClasses(Greeter.class);
        System.out.println(jar.toString(true));
        return jar;
    }

    @Test
    public void shouldInjectEjb() {
        assertThat(greeter, notNullValue());
        assertThat(greeter.greet(), equalTo("Hello world"));
        System.out.println(greeter.greet());
    }

}
```

During startup, the test should print the contents of the deployed archive and after the successful test, `Hello world` should also be printed in the WebLogic logs as it will be run in the container (contrary to `@RunAsClient`).

## Troubleshooting

You might encounter some issues during configuration. Here are the most common problems:

> java.io.FileNotFoundException: ...\wlserver\.product.properties (The system cannot find the path specified)

`WL_HOME` variable might be pointing to the wrong directory.

> java.lang.ClassNotFoundException: javax.ejb.embeddable.EJBContainer<br/>
> javax.ejb.EJBException: No EJBContainer provider available: no provider names had been found.

Usually caused by the wrong path to the `weblogic.jar` or container dependency not provided.

> Missing descriptor: weblogic.management.DeploymentException: [J2EE:160177]

This means that relevant descriptors are missing and should be added during ShrinkWrap archive creation.

> sun.misc.InvalidJarIndexException: Invalid index

Either `WL_HOME` is pointing to the 12.2 version or VM options `-da -Djava.system.class.loader=com.oracle.classloader.weblogic.LaunchClassLoader` are missing during test execution.

> javax.naming.NamingException: Couldn't connect to the specified host

Verify that `adminUrl` is configured properly and the server is running.