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

Correctly using the `dependencyManagement` section in a Maven project configuration facilitates version consistency and
prevents dependency conflicts. However, it's easy to end up in a situation where, by overriding `dependencyManagement` in
the `dependencies` section, Maven selects an inappropriate version when importing our project.

## Overriding *dependencyManagement* in *dependencies* as an anti-pattern

Let's illustrate this problem with an example of a library that uses Spring and requires `spring-core` with an
overridden version of `spring-jcl`. While this example may not seem practical (as we typically update the entire Spring
BOM),  the way Maven resolves dependencies can affect your project (and understanding such situations is valuable, also for inter-module overrides).

### Client not using *dependencyManagement*

We will now explore the `pom.xml` configuration for such a library:

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

The configuration for a client adding the library can look like this:

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

After running the `maven-dependency-plugin` with the `tree` goal listing dependencies for both projects and
the `-Dverbose=true` parameter, we get additional information about the resolved versions of libraries:

```sql
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ lib ---
[INFO] org.example:lib-a:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:6.0.0:compile
[INFO] |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO] \- org.springframework:spring-jcl:jar:6.0.1:compile
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ client ---
[INFO] org.example:client:jar:1.0-SNAPSHOT
[INFO] \- org.example:lib-a:jar:1.0-SNAPSHOT:compile
[INFO]    +- org.springframework:spring-core:jar:6.0.0:compile
[INFO]    |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO]    \- org.springframework:spring-jcl:jar:6.0.1:compile
```

Everything checks out; both projects resolve identical versions overridden within the `dependencies` section
of our library. The term "omitted for conflict" means Maven chose a different version according to
the [standard dependency resolution order](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#transitive-dependencies).

### Client using *dependencyManagement*

It often happens that the client also uses a chosen BOM to define versions of other utilized libraries. Hence, an
intuitive question arises: What version of the dependency will Maven resolve when importing a library that overrides a
transitive dependency through `dependencies`?

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

It turns out that the version of `spring-jcl` differs between the library and the project using that library.

```sql
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ lib-a ---
[INFO] org.example:lib-a:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:6.0.0:compile
[INFO] |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - omitted for conflict with 6.0.1)
[INFO] \- org.springframework:spring-jcl:jar:6.0.1:compile
[INFO] --- maven-dependency-plugin:2.8:tree (default-cli) @ client ---
[INFO] org.example:client:jar:1.0-SNAPSHOT
[INFO] \- org.example:lib-a:jar:1.0-SNAPSHOT:compile
[INFO]    +- org.springframework:spring-core:jar:6.0.0:compile
[INFO]    |  \- (org.springframework:spring-jcl:jar:6.0.0:compile - version managed from 6.0.1; omitted for duplicate)
[INFO]    \- org.springframework:spring-jcl:jar:6.0.0:compile
```

The term "X version managed from Y" means that version "X" has been overridden by version "Y"
through `dependencyManagement`. This example extends to situations where either the
library or the client uses a parent importing a BOM with a given dependency.
Such overriding in the context of a library using `dependencyManagement` can often be an unintended consequence of
needing to update a vulnerable transitive dependency.

Unfortunately, the `exclusions` tag, when within the `dependencyManagement` for `pom` type imports, does not exclude (Maven 3.8/3.9).
Dependencies imported via the POM type
within `dependencies` are also treated as transitive dependencies by Maven. They are not considered "nearest" when
prioritized through `dependencyManagement`.

<img src="/img/hq/maven-dependency-management-dependency-override.png" title='POM import under "dependencies"' alt='POM import under "dependencies"'>

If the library is to be imported with a BOM, the simplest solution
is to move the override to `dependencyManagement` or create a custom BOM artifact. In other cases the client, after
thorough testing, will need to override dependencies manually.
