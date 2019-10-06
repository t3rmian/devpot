---
title: Manipulating Java artifacts
url: manipulating-java-artifacts
id: 14
tags:
  - java
  - maven
  - bytecode
author: Damian Terlecki
date: 2019-10-06T20:00:00
---

Sometimes you encounter this one bug in an external library, and after many hours you find out that it's practically impossible to make any workaround. The components might be very tightly coupled and impossible to extend (hello static methods). Java, however, is a very mature language and there are some methods to cope with such situations.

#### Overview

The basic overview of our situation is that Java code (`.java` files) is compiled (`javac`) to bytecode (`.class` files) and then packaged into an archive ([J|W|E]AR) usually with some meta-information. The classes of such an artifact are later loaded at runtime into JVM (memory) by a [ClassLoader](https://docs.oracle.com/javase/10/docs/api/java/lang/ClassLoader.html), verified and compiled into native code by a JIT Compiler. Within this process, you can find multiple ways to solve the problem with problematic classes. This is a pretty broad topic, but you could consider:
- [reordering the classpath](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/classpath.html#JSWOR590) so that the correct class is loaded first;
- implementing your own [ClassLoader](https://docs.oracle.com/javase/10/docs/api/java/lang/ClassLoader.html) which will load the correct class (beware of loading by multiple ClassLoaders);
- using [instrumentation API](https://docs.oracle.com/javase/10/docs/api/java/lang/instrument/package-summary.html) and implementing your own Java Agent which will redefine or retransform classes (with some limitations);
- removing the class from the artifact archive and implementing your own one.

<img src="/img/hq/bytecode.svg" alt="Bytecode" title="Bytecode">

If you've ever checked how a bytecode looks, you will probably agree that manipulating it might be pretty complex. Fortunately, there are many libraries that can help with this like ByteBuddy, Javassist or ASM. I've been successful with using them to fix some specific bugs in external library static methods in wait for a proper bugfix. Often though, bytecode manipulation or introducing custom ClassLoaders might not be that feasible, especially in enterprise environments where you may have limited viability to modify the startup/deployment scripts or redefine the order of precedence for a classpath.

#### Manipulating Java artifacts

In some specific cases, though, you may get by with removing the bugged class from the artifact archive and implement your own one. A perfect example would be an MDB (Message Driven Bean) component in JEE. Usually, such components are loosely-coupled and can be removed without much side effects. Prior to that, it's recommended to check any deployment descriptions and the application server to retain any specific configuration. This solution is not very elegant but get's the job done until the component in the dependent library is fixed.

To remove the class you can unpack the archive remove it and package it again. With Maven it's possible to automate it into the build process with some plugin like [truezip-maven-plugin](https://www.mojohaus.org/truezip/truezip-maven-plugin/):

```xml
&lt;plugins&gt;
  &lt;plugin&gt;
    &lt;groupId&gt;org.codehaus.mojo&lt;/groupId&gt;
    &lt;artifactId&gt;truezip-maven-plugin&lt;/artifactId&gt;
    &lt;version&gt;1.2&lt;/version&gt;
    &lt;executions&gt;
      &lt;execution&gt;
        &lt;id&gt;remove-a-file&lt;/id&gt;
        &lt;goals&gt;
          &lt;goal&gt;remove&lt;/goal&gt;
        &lt;/goals&gt;
        &lt;phase&gt;package&lt;/phase&gt;
        &lt;configuration&gt;
          &lt;fileset&gt;
            &lt;directory&gt;${project.build.directory}/com.example.project.ear/lib/com.example.library.jar/&lt;/directory&gt;
            &lt;includes&gt;
              &lt;include&gt;com/example/library/Broken.class&lt;/include&gt;
            &lt;/includes&gt;
          &lt;/fileset&gt;
        &lt;/configuration&gt;
      &lt;/execution&gt;
    &lt;/executions&gt;
  &lt;/plugin&gt;
&lt;/plugins&gt;
```

Depending on whether you're deploying an exploded archive or not, you might want to edit the plugin configuration. It's quite a dirty way, so use it as a last resort when hotfixing stuff.