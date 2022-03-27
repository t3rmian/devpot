---
title: Java Foreign Linker API in action
url: java-foreign-linker-api-setsockopt
id: 72
category:
- java: Java
tags:
  - native
author: Damian Terlecki
date: 2021-08-08T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

In [one of my previous articles](/posts/java-socket-native-options), I showed how we can use a Java socket descriptor to set some native TCP/IP options using JNA
(Java Native Access). Recently, the JDK enhancement proposal [JEP 389: Foreign Linker API (Incubator)](https://openjdk.java.net/jeps/389) implemented in
JDK 16 as a complement to the Foreign-Memory Access API (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393),
introduced yet another powerful interface allowing great interoperability with C libraries.

JEP 389 is actually an incubation module (JEP 11) in the form of the `jdk.incubator.foreign` package. This means that the interface is not finalized yet, but
in JDK 16 we can already test this feature. So let's see what the implementation of native socket options could look like when the JNA
is replaced by the FLA (Foreign Linker API).

## Foreign Linker API and setsockopt

To set up our playground, we will need to add the `jdk.incubator.foreign` module to the compilation phase. Using Maven,
just add the following parameters to the *maven-compiler-plugin*:

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
                <source>16</source>
                <target>16</target>
                <compilerArgs>
                    <arg>--add-modules</arg>
                    <arg>jdk.incubator.foreign</arg>
                </compilerArgs>
            </configuration>
        </plugin>
    </plugins>
</build>
```

This should provide us with the visibility (in the IDE/compiler) of the classes from the new package. We'll start with the **CLinker** class.
Except for static methods, on an instance of this object, we can find two methods: ***downcallHandle*** and ***upcallStub***.
The first one allows you to map an external function (e.g. from a C library),
whereas the other one can be used to create a pointer to such a function, which can be later passed to another function.

To call the ***setsockopt*** C function, we will use the ***downcallHandle*** method. For this, we will need to look up the function symbol
and define its type and descriptor.
These arguments are quite relevant, and the following code will surely be understandable for you:

```java
import jdk.incubator.foreign.CLinker;
import jdk.incubator.foreign.FunctionDescriptor;
import jdk.incubator.foreign.LibraryLookup;
import jdk.incubator.foreign.MemoryAddress;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodType;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    // /usr/include/x86_64-linux-gnu/sys/socket.h:
    // extern int setsockopt (int __fd, int __level, int __optname, const void *__optval, socklen_t __optlen) __THROW; 
    private static final MethodHandle setsockopt = CLinker.getInstance().downcallHandle(
            LibraryLookup.ofDefault()
                    .lookup("setsockopt")
                    .orElseThrow(ExceptionInInitializerError::new),
            MethodType.methodType(
                    int.class,
                    int.class,
                    int.class,
                    int.class,
                    MemoryAddress.class,
                    int.class
            ),
            FunctionDescriptor.of(
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_POINTER,
                    CLinker.C_INT
            )
    );
    //...
}
```

The library function can be looked up through the ***LibraryLookup*** instance. If the function is part of static libraries
linked to the virtual machine, we can use the ***ofDefault*** static factory method. Alternatively, knowing the name of the library, we can load it
using the ***ofLibrary*** static method.

Finally, we use the ***MethodType*** to define and ***FunctionDescriptor*** to link the function parameters.
Note how the ***CLinker.C_POINTER*** indicates the ***MemoryAddress*** pointer to some memory address.

At the same time, the interface allows you to define a reference to a global variable from a selected library (e.g. to an error code set by a system function):

```java
import jdk.incubator.foreign.MemorySegment;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    private static final MemorySegment errno = LibraryLookup.ofDefault()
            .lookup("errno").orElseThrow(ExceptionInInitializerError::new)
            .address().asSegmentRestricted(8);
    //...
}
```

The function call is the same as in the reflection mechanism. However, unlike JNA, we will not get an exception
when a native function exits with a non-zero value. We have to take explicitly implement the error code/message retrieval
just like in the native code:

```java
import dev.termian.setsockopt.net.impl.FileDescriptorWrapper;
import java.io.IOException;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    private static void setSockOpt(FileDescriptorWrapper fileDescriptor, int level, int optionName, MemorySegment optionValue) throws Throwable {
        Integer result = (Integer) setsockopt.invoke(
                fileDescriptor.getFd(),
                level,
                optionName,
                optionValue.address(),
                4
        );
        if (result != 0) {
            throw new IOException("Error code: " + errno.toIntArray()[0]);
        }
    }
    //...
}
```

The final piece of logic is the native memory allocation that. Note this happens **outside the heap**.
The allocated segment can then be used to set the value of the socket option.
Ultimately, the interface exposes the native memory address for use in the C functions.

```java
import jdk.incubator.foreign.MemoryAccess;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    @Override
    public void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment) {
        try (MemorySegment optionValue = MemorySegment.allocateNative(32)) {
            MemoryAccess.setIntAtIndex(optionValue, 0, dontFragment ? CSocket.IP_PMTUDISC_WANT : CSocket.IP_PMTUDISC_DONT);
            setSockOpt(fileDescriptor, CSocket.IPPROTO_IP, CSocket.IP_MTU_DISCOVER, optionValue);
        } catch (Throwable throwable) {
            throw new RuntimeException(throwable);
        }
    }
}
```

When executed on Java 16, there is an additional step required. The `foreign.restricted` flag prevents the unexpected use of some parts of this API.
These can result in crashes or memory corruption if not handled with care.
Bearing this in mind, as well as the reflection mechanism used to obtain the descriptor in the previous article,
the JVM parameters that allow our program to run would look like this:
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="Missing module during the compilation step: &quot;java: package jdk.incubator.foreign is not visible&quot;, during runtime: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;, missing flag: &quot;java.lang.IllegalAccessError: Illegal access to restricted foreign method: CLinker.getInstance ; system property 'foreign.restricted' is set to 'deny'&quot;" title="Foreign Linker API: -Dforeign.restricted=warn">

## Summary

Foreign Linker API and Foreign Memory Access API are very promising JDK enhancements.
They provide incredible interoperability with C libraries and native memory.
In the incubation phase, they offer many possibilities so far only available using JNA / JNI glue code and the `sun.misc.Unsafe` class.
If you want to take a look at the full source code of this sample, take a look at the repository at the bottom of the page.