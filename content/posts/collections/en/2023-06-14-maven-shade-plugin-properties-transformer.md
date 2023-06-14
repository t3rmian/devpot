---
title: Maven Shade Plugin's PropertiesTransformer with examples
url: maven-shade-plugin-properties-transformer
id: 112
category:
  - java: Java
tags:
  - maven
  - maven-shade-plugin
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

Maven Shade Plugin is an extension that allows you to combine dependencies during the project build process. The
purpose of this plugin is to create one JAR file containing all the application dependencies and its code.

Within this process, merging configuration files, such as `*.properties`, can sometimes be problematic. By default, the
last encountered file will win its place in the resulting artifact.
The plugin offers configuration using so-called transformers to resolve such problems and influence the behavior of resource merging.

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='Maven Shade Plugin reporting resources overlap' alt='Maven Shade Plugin reporting resources overlap'>

## Transformacja *PropertiesTransformer*

The plugin itself offers multiple pre-installed transformers. More complex ones you can import from external providers. Since
version 3.2.2, the developers have also provided an implementation
of `org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`.
It's name can sound quite promising when you need to change the order of combining properties.
You may want this for the application to load the preferred (usually overridden) properties.

If you take a look at the [*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)
and try the example configuration (referenced below), you might have a hard time reaching your expected result.
The explanation of the properties may seem a bit superficial, which is why it's best to see the behavior on the examples
([version 3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java)).

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- required configuration -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- optional configuration -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

Having two `configuration/application.properties` files from module A and module B respectively:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
the *maven-shade-plugin*'s *shade* goal with the *PropertiesTransformer*  combining both dependencies will produce the following `configuration/application.properties` file by default:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***


### *ordinalKey* and *defaultOrdinal*

The order in which the files will be merged is controlled by the `ordinalKey` pointing to the name of the property
whose value is the numeric order. If the properties file does not contain such a key, its order is defined by the `defaultOrdinal` (0 if missing).
By defining a higher than the default order in module A file:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```

in the output, you will get the property `prop2` from module A, i.e., effectively achieving the reversed order.
Additionally, the transformer will remove the artificial key:

```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

The `alreadyMergedKey` defines a `boolean` value type (e.g., a `true` *String*) property name that indicates file priority.
This way, the transformer will not merge other files into this one.

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
For such properties, you'll get a copy of properties from module A, again with the `already_merged` synthetic key removed:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

The occurrence of such a key with a `true` value in more than one file is not allowed and will result in an error.

***


### *reverseOrder*

You can use the `reverseOrder` option to reverse the order of concatenating files. Unfortunately, this feature
does not reverse the order between files with the same order value. I.e., for `<reverseOrder>true</reverseOrder>` and two
property files:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
you will still (regardless of the value of the `reverseOrder`) get the same result:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

The reversal works only after defining the order with `ordinalKey` and only between the files of a different order.

***

## Summary

The `PropertiesTransformer` allows for the basic merging of property files. It is worth knowing that files are initially loaded
using `java.util.Properties`. It means that duplicates are overwritten with the most recent (closest to the bottom) property within the
same file.

To determine the order of file merging or designate a priority file among multiple files, you must include an artificial key.
Regrettably, reversing the order between files with identical or default order values is not feasible.

So if you need a slightly different merging behavior (e.g., without the need to add artificial keys), look for external add-on packs with custom transformers.
You can easily add such a dependency using the `<dependencies></dependencies>` tag inside the `<plugin></plugin>`.
If you simply want to combine the properties in reverse order, take a look at the
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0).
