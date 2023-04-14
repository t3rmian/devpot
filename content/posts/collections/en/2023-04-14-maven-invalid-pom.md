---
title: Invalid POM due to an unresolved Maven property
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

Maven uses the `pom.xml` configuration file to manage the project build. When parsing the file,
the tool resolves project dependencies and determines what libraries and tools are required to build the artifacts.
In the process, Maven also parses external POM files to determine transitive dependencies.

## Unresolved Maven property

It may happen that a remote library POM file will contain errors, logical more so than syntactical ones.
One of the reasons for these types of issues is the use of expressions referring to non-existent [maven properties](https://maven.apache.org/pom.html#Properties).
In case of errors during dependency processing, Maven will skip loading transitive artifacts, and we will output an example warning:

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details' alt='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details'>

You will quickly notice that the dependencies declared in the `pom.xml` library are basically ignored and unresolvable in the project.
To find out more about the cause, add the `-X` parameter. It is a shorter abbreviation form of the `--debug` parameter.

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' for com.sun:tools:jar must specify an absolute path but is ${tools.jar} @

In this particular case, Maven is unable to evaluate the `${tools.jar}` expression.
Looking at the `pom.xml` files, we conclude that this expression is needed to define the system `tools` dependency in one of the parent POMs:

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

After further verification of the dependencies of this particular artifact, you may even come to the conclusion that the system dependency is not used in this submodule.
Unfortunately, the lack of a file in the location `${java.home}/../lib/tools.jar` or `${java.home}/../Classes/classes.jar` makes the variable `${tools.jar}` uninitialized.

Specific to this example, the problem is related to JDK 11+ version. In this version, the mentioned tools have been removed.
This change is supported starting from the `jaxws-rt:2.3.x`, which also entails a specification upgrade relevant to this library.

Overall, the problem is more general and can be extrapolated to a situation where Maven is unable to evaluate an expression when resolving external dependencies.
Do we have any influence over this?

## POM file expression evaluation

The properties source evaluation order is implemented in the [`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175) for Maven v3/4 and 
can be simplified as follows:
- Java Properties – `-Dkey=value`;
- Maven properties – `<properties><key>value</key></properties>`;
- Environment variables – `set/export key=value`.

In a multi-module project, Maven properties can be inherited by the submodules within the same project. However, these variables are not automatically propagated to the external dependencies of the project.
On the other hand, Java and environment variables are initialized at the beginning of Maven processing, so adding them during the execution does not affect the evaluation.
Furthermore, in the case of external dependencies, Java variables are consolidated to the level of environment variables ([MNG-7563](https://issues.apache.org/jira/browse/MNG-7563)).

Knowing the above rules, you can initialize a Maven property in the external `pom.xml` in several different ways, e.g., through:
- Environment variable (beware of problems with exporting dot-containing variables on Unix-like systems); 
- Java Property initialized using command line `mvn -Dkey=value validate`; 
- Environment variable at the start of the command `key=value mvn validate`; 
- Maven configuration file relative to the project `.mvn/maven.config` that sets the Java Property `-Dkey=value`; 
- Global run commands defined in e.g., `~/.mavenrc` that set the environment variable `set/export key=value` (beware of problems in IntelliJ, e.g., [IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner)).

The last resort is certainly to download manually (or indirectly) the dependency and add it to the compile/build paths of the artifact.

> As an alternative build tool, Gradle v4-8 fares a bit better here. It doesn't throw an error for non-affected dependencies, and the artifacts get imported correctly.