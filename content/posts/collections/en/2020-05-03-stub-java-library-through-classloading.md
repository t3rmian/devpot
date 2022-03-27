---
title: Stubbing Java library with the help of ClassLoader
url: stub-java-library-through-classloading
id: 29
category:
  - java: Java
tags:
  - tomcat
  - weblogic
  - classloading
  - jvm
  - testing
author: Damian Terlecki
date: 2020-05-03T20:00:00
---

Sometimes we might be tasked with integrating our application with an external system, to which we won't have access from our development environments. It may become quite a pickle if the integration can only be tested on the client infrastructure. Especially when it's bound to the core features of our developed system. Some parts might require a connection to the services which we are not aware of.

If it's a web service, we can usually create a mock server. For a development environment, we can use Postman or SoapUI. In the case of a test / QA environment, we could run a standalone [mock server](https://www.mock-server.com/). But what if we are using a client-provided external library for such an integration, and we don't know the specifics of the implementation?

For sure we could create a facade for such a library, stubbing the library with the data we expect to receive. Then, based on an environment variable or a build profile, we would have two separate data flows. One for a test environment and another for the test environment on the client infrastructure. However, if you don't want to have this code/switch included in the production build, there is also another option.

### Stubbing the library

Since we know which classes we use from the library, and have some understanding of what data we have to expect from the third party library, we are ready to stub it. The process is quite simple and very similar to writing tests with stubs. What we need to do is to create the same class with the methods we use, under the library package.

As an example let's take an Apache Commons Lang 3 library – probably one of the most popular utility libraries. If we want to create a stub library with `StringUtils.capitalize()` method returning a predefined value, we would have to create `src/main/java/org/apache/commons/lang3/StringUtils.java` class, compile it and package within a separate JAR (or just use the `classes` directory):

```java
package org.apache.commons.lang3;

public class StringUtils {

    public static String capitalize(String text) {
        return "PREDEFINED";
    }

}
```

Note that there are also other methods in this class. If you don't provide their stubs and later on you or any library/component happen to call the missing method, you will get an exception:

> Exception in thread "main" java.lang.NoSuchMethodError: org.apache.commons.lang3.StringUtils.uncapitalize(Ljava/lang/String;)Ljava/lang/String;


### Classloading

Assuming your application is running on the JVM, you must have heard about the class loading system. In short, a ClassLoader is basically a class that loads other classes, usually on demand, during the runtime. One exception worth noting is the Bootstrap ClassLoader, which is treated as a null  (parent) reference and executed in the form of a native code (`findBootstrapClassOrNull(String)` ClassLoader method).

Three standard ClassLoaders are:
1. Bootstrap ClassLoader – loads classes required for JRE from `$JAVA_HOME/jre/lib`.
2. Extension ClassLoader – loads installed extensions from `$JAVA_HOME/jre/lib/ext`. <b class="err">Removed (the mechanism) from Java 9 and above!</b>
3. System (Application) ClassLoader – loads the application classes from the classpath.

The default delegation model for class loading is the [parent-delegation model](https://docs.oracle.com/javase/tutorial/ext/basics/load.html). This means that if there is a request to load the class by the class loader at the bottom of the hierarchy, the class loader first delegates the request to the parent class loader before it tries to load the class by itself.

This is very cleanly implemented in `java.lang.ClassLoader` (source: [OpenJDK 11](https://github.com/AdoptOpenJDK/openjdk-jdk11/blob/master/src/java.base/share/classes/java/lang/ClassLoader.java), GPL 2.0; removed time measurements for clarity):
```java
    protected Class<?> loadClass(String name, boolean resolve)
        throws ClassNotFoundException
    {
        synchronized (getClassLoadingLock(name)) {
            // First, check if the class has already been loaded
            Class<?> c = findLoadedClass(name);
            if (c == null) {
                try {
                    if (parent != null) {
                        c = parent.loadClass(name, false);
                    } else {
                        c = findBootstrapClassOrNull(name);
                    }
                } catch (ClassNotFoundException e) {
                    // ClassNotFoundException thrown if class not found
                    // from the non-null parent class loader
                }

                if (c == null) {
                    // If still not found, then invoke findClass in order
                    // to find the class.
                    c = findClass(name);
                }
            }
            if (resolve) {
                resolveClass(c);
            }
            return c;
        }
    }
```

As a result, if we have the same library in the scope of the Application ClassLoader and in the Extensions ClassLoader, the library version from the latter one will be loaded (its higher in the hierarchy). Assuming we haven't implemented any custom class loading that would break this delegation model, we can use this mechanism and put a stubbed library version in the scope of the parent (to our application) class loader (e.g. in `$JAVA_HOME/jre/lib/ext`).


### Application servers

All application servers come with additional class loaders due to specification requirements. This allows the applications to have access to different classes and resources without having to worry about conflicts.

One class loader that's prevalent in many application containers is a Common Class Loader. Usually, this class loader will load additional classes that will be visible to all applications deployed on a given server. This might be a bit better place to put your stubs, rather than polluting the Extensions ClassLoader, which is 'shared' by all JVMs.

Different locations are scanned for different servers:
- `WebSphere/AppServer/lib/ext` for WebSphere;
- `$DOMAIN_DIR/lib/classes/` (class files) and `$DOMAIN_DIR/lib/` (JARs) for GlassFish;
- `$DOMAIN_DIR/lib` for WebLogic;
- `$CATALINA_BASE/lib` and `$CATALINA_HOME/lib` for Tomcat;
- [Global modules](http://docs.wildfly.org/19/Developer_Guide.html#global-modules) and [global directory](http://docs.wildfly.org/19/Developer_Guide.html#global-directory) in WildFly.

### Tomcat

Tomcat has a bit inverted class loader. First, it loads Bootstrap classes of your JVM, then the classes from the web application, and lastly system and common classes. To enable the standard delegation model, a `<Loader delegate="true"/>` element is required under the `<Context></Context>` in the `conf/context.xml` or in the WAR `META-INF/context.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Context>
  <Loader delegate="true"/>
  <WatchedResource>WEB-INF/web.xml</WatchedResource>
  <WatchedResource>${catalina.base}/conf/web.xml</WatchedResource>
</Context>
```

### Summary

Knowing how the class loading works for your application can be really handy. With a few easy steps, it's possible to stub a library or a class, without the need to change your application code. This can give you more flexibility in testing your system when external services (hidden behind library interfaces) cannot be replicated on your environments.

On the other hand, since this method effectively shares the library between multiple applications, you should consider the pros and cons. Taking this too far might create a maintenance hell.

Note also, that the extension mechanism for loading classes from `$JAVA_HOME/jre/lib/ext`, has been removed from Java 9 onwards, due to the modularization ([JEP 220](https://openjdk.java.net/jeps/220#Removed:-The-extension-mechanism)). To achieve similar results in a non-server application, using only ApplicationClassLoader you could specify the stub jars/classes before the real ones on the classpath.

> The Java interpreter will look for classes in the directories in the order they appear in the class path variable [[Java 8 Specification Order]](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/classpath.html#sthref15).