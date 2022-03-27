---
title: Java Socket native options
url: java-socket-native-options
id: 70
category:
- java: Java
tags:
  - native
author: Damian Terlecki
date: 2021-07-12T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

When in need of applying TCP/IP options beyond those offered by Java, we have several options to choose from:

1. The [RockSaw](https://www.savarese.com/software/rocksaw/) library – allows you to create a SOCK_RAW type socket,
skipping the TCP/IP processing. This solution allows for a fairly low-level implementation of your own protocol.
Creating such a socket requires administrator privileges.
2. A custom interface implementation that allows you to set additional TCP/IP options – various operating systems offer
some additional configuration options beyond those provided by Java. Such a solution involves the use of an external library,
alternative to the *java.net/java.nio* packages, or implementation of your own one using JNI (Java Native Interface) or JNA
(Java Native Access).
3. Reusing the standard Java packages and combining them with JNI/JNA binding for additional configuration.

These three options come with varying levels of complexity. It is important to choose the right solution and
take into consideration the pros and cons, among other things, maintenance feasibility, portability (cross-platform support), and error-proneness.

Unfortunately, apart from *RockSaw*, I did not find a proven library for communication using standard sockets.
Additionally, by using the reflection mechanism alone, we are unable to bypass the configuration constraints found in JNI methods.
Let's then consider option 3 as the least time-consuming for extending the TCP/IP options beyond the Java capabilities.

<img src="/img/hq/java-ip-dont-fragment.png" alt="Wireshark – DF flag set to 0" title="Wireshark – DF flag set to 0">

## setsockopt

On Windows, Linux, and BSD the TCP/IP options are configured using the C language *setockopt* function.
This function expects, that we pass a socket as well as the option level indicating the protocol of the selected TCP/IP layer and its value.
The socket is equivalent to a file descriptor, which defines a unique identifier of the resource on the system.

By analyzing the **implementation** of the standard Java classes related to the `java.net.Socket` and ` java.nio.channels.SocketChannel`,
we can find references to such descriptors in the following classes:
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`;
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`.

Looking deeper into the code, we will see that the descriptor is set during the opening/creating of the channel through the *SocketChannel.open()*.
In the case of a *Socket* creation, it is done during the *bind/connect()* operation.
Finally, the (TCP/IP) options are set through a [native method](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528),
specific to the Java version. Ultimately, the call is delegated to the *setsockopt* function, which configures the related descriptor.

## Java ➜ *setsockopt*

Knowing how the TCP/IP options are configured, we can proceed to the implementation of our extension.
The easiest way will be to get the reference to the socket descriptor.
After that, the TCP/IP options could be applied directly to this descriptor through our own native method invocation.
This way, we will still be able to use the socket in the usual way from the Java code.

### JNA

Let's start from the very bottom. We will use the JNA to load a C library implementing the *setsockopt* function call.
JNA approach is a much simpler and safer approach than writing native glue code in JNI.
We will add the following dependency to the *pom.xml* (Maven) file:

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

Our example will be for a Linux system. The equivalent code for Windows can be found in the repository at the bottom of the page.
In the case of Linux, the library implementing the socket configuration is called **libc**. This library can be loaded (by dropping the `lib` prefix) and exposed as a Java interface
using JNA:

```java
package dev.termian.setsockopt.net.config;

import com.sun.jna.LastErrorException;
import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;

interface CSocket extends Library {
    CSocket INSTANCE = Native.load("c", CSocket.class);

    int IPPROTO_IP = 0; // grep IPPROTO_IP /usr/include/netinet/in.h
    int IP_MTU_DISCOVER = 10; // find /usr/include -name in.h | xargs grep IP_MTU_DISCOVER
    int IP_PMTUDISC_DONT = 0; // find /usr/include -name in.h | xargs grep IP_PMTUDISC_DONT
    int IP_PMTUDISC_WANT = 1; // find /usr/include -name in.h | xargs grep IP_PMTUDISC_WANT
    int IP_TTL = 2; // find /usr/include -name in.h | xargs grep IP_TTL
    
    int setsockopt(
            int socket,
            int level,
            int option_name,
            Pointer option_value,
            int option_len
    ) throws LastErrorException; // find /usr/include -name socket.h | xargs grep setsockopt

}
```

JNA allows us to define the library interface in a very clear way. For our needs, we only need the *setsockopt* function.
Additionally, we define some configuration parameters found in the individual header files.
For example, let's try to set the IP DF (Don't Fragment) flag and the IP TTL (Time To Live) value.

```java
package dev.termian.setsockopt.net.config;

import com.sun.jna.ptr.IntByReference;

public class LinuxSocketConfigurer extends SocketConfigurer {

    public LinuxSocketConfigurer(Configuration configuration) {
        super(configuration);
    }

    @Override
    public void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment) {
        CSocket.INSTANCE.setsockopt(
                fileDescriptor.getFd(),
                CSocket.IPPROTO_IP,
                CSocket.IP_MTU_DISCOVER,
                new IntByReference(dontFragment ?
                        CSocket.IP_PMTUDISC_WANT :
                        CSocket.IP_PMTUDISC_DONT
                ).getPointer(),
                4
        );
    }

    @Override
    public void setTtl(FileDescriptorWrapper fileDescriptor, int ttl) {
        CSocket.INSTANCE.setsockopt(
                fileDescriptor.getFd(),
                CSocket.IPPROTO_IP,
                CSocket.IP_TTL,
                new IntByReference(ttl).getPointer(),
                4
        );
    }

}
```

In the case of Linux, starting from version 2.2, the DF flag can be enabled by passing the IP_MTU_DISCOVER option with the value of IP_PMTUDISC_DONT.
Calling a function from a C library with JNA is very simple. Note how the JNA simplifies the passing of a buffer reference.
For comparison, the C function looks like this:

```java
extern int setsockopt (
        int __fd,
        int __level,
        int __optname,
        const void *__optval,
        socklen_t __optlen
       ) __THROW;
```

### File Descriptor

Now we only need our socket descriptor. Unfortunately, in the case of standard Java packages, this descriptor
is not part of the interface. Taking shortcuts, we can use the reflection mechanism. 
Note, however, that in the event of changes in the implementation this may lead to errors when the Java version is upgraded.

The actual reference lies in the `fd` field of the *FileDescriptor* class:

```java
package dev.termian.setsockopt.net.impl;

import java.io.FileDescriptor;
import java.lang.reflect.Field;

public class FileDescriptorWrapper {

    private static final Field FD;

    static {
        try {
            FD = FileDescriptor.class.getDeclaredField("fd");
            FD.setAccessible(true);
        } catch (NoSuchFieldException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private final int fd;

    FileDescriptorWrapper(FileDescriptor fileDescriptor) throws IllegalAccessException {
        this.fd = FD.getInt(fileDescriptor);
    }

    public int getFd() {
        return fd;
    }

}
```

The *FileDescriptor* object can be obtained, as mentioned earlier, from the specific implementation of *Socket* or *SocketChannel*:

```java
package dev.termian.setsockopt.net.impl;

import dev.termian.setsockopt.net.factory.SocketChannelFactory;
import dev.termian.setsockopt.net.config.SocketConfigurer;

import java.io.FileDescriptor;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.channels.SocketChannel;

public class NativeSocketChannelFactory extends SocketChannelFactory {

    private static final Field SOCKET_CHANNEL_FD;

    static {
        try {
            Class<?> socketChannelImpl = Class.forName("sun.nio.ch.SocketChannelImpl");
            SOCKET_CHANNEL_FD = socketChannelImpl.getDeclaredField("fd");
            SOCKET_CHANNEL_FD.setAccessible(true);
        } catch (NoSuchFieldException | ClassNotFoundException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    private final SocketConfigurer socketConfigurer;

    public NativeSocketChannelFactory(SocketConfigurer socketConfigurer) {
        this.socketConfigurer = socketConfigurer;
    }

    @Override
    public SocketChannel open() throws IOException {
        SocketChannel socketChannel = SocketChannel.open();
        try {
            configure(socketChannel);
        } catch (Exception e) {
            try {
                socketChannel.close();
            } catch (IOException ignored) {
            }
            throw e;
        }
        return socketChannel;
    }

    @Override
    public void configure(SocketChannel socketChannel) throws IOException {
        FileDescriptorWrapper fileDescriptor = getFileDescriptor(socketChannel);
        socketConfigurer.setOptions(fileDescriptor);
    }

    private FileDescriptorWrapper getFileDescriptor(SocketChannel channel)
            throws IOException {
        try {
            FileDescriptor fileDescriptor = (FileDescriptor) SOCKET_CHANNEL_FD.get(channel);
            return new FileDescriptorWrapper(fileDescriptor);
        } catch (IllegalAccessException iae) {
            throw new IOException(iae);
        }
    }

}
```

### The Configuration

Usually, some kind of a builder is used for defining the configuration.
A more functional approach involves applying the options through the configuration function:

```java
public interface Configurer {

    void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment)
            throws IOException;

    void setTtl(FileDescriptorWrapper fileDescriptor, int ttl) throws IOException;

}

public abstract class SocketConfigurer implements Configurer {

    private final Configuration configuration;

    public SocketConfigurer(Configuration configuration) {
        this.configuration = configuration;
    }

    public void setOptions(FileDescriptorWrapper fileDescriptor) throws IOException {
        configuration.apply(this, fileDescriptor);
    }

}

public interface Configuration {

    void apply(Configurer configurer, FileDescriptorWrapper fileDescriptor)
            throws IOException;

}
```

### Client Interface

With a static factory method that we can retrieve an implementation that is specific to our platform:

```java
package dev.termian.setsockopt.net.factory;

import com.sun.jna.Platform;
import dev.termian.setsockopt.net.config.Configuration;
import dev.termian.setsockopt.net.config.LinuxSocketConfigurer;
import dev.termian.setsockopt.net.config.WindowsSocketConfigurer;
import dev.termian.setsockopt.net.impl.NativeSocketChannelFactory;

import java.io.IOException;
import java.nio.channels.SocketChannel;

public abstract class SocketChannelFactory {

    public static SocketChannelFactory getInstance(Configuration configuration) {
        switch (Platform.getOSType()) {
            case Platform.LINUX:
                return new NativeSocketChannelFactory(
                        new LinuxSocketConfigurer(configuration)
                );
            case Platform.WINDOWS:
                return new NativeSocketChannelFactory(
                        new WindowsSocketConfigurer(configuration)
                );
            default:
                throw new UnsupportedOperationException("Not implemented");
        }
    }

    public abstract SocketChannel open() throws IOException;
    public abstract void configure(SocketChannel socketChannel) throws IOException;

}
```

As a client of this interface, we can now configure the socket channel without delving into the implementation:

```java
public class SocketClient {
    public static void main(String[] args) throws IOException {
        SocketChannelFactory socketChannelFactory = SocketChannelFactory
                .getInstance((configurer, fileDescriptor) -> {
                    configurer.setDontFragment(fileDescriptor, false);
                    configurer.setTtl(fileDescriptor, 2);
                });

        try (SocketChannel channel = socketChannelFactory.open()) {
            Socket socket = channel.socket();
            InetSocketAddress address = new InetSocketAddress(
                    InetAddress.getLoopbackAddress(), Server.PORT
            );
            channel.connect(address);
            OutputStream outputStream = socket.getOutputStream();
            outputStream.write(new byte[5000]);
        }
    }
}
```

Ultimately, we can easily connect it to a given client or library. Some tips where this implementation could be injected:
- Apache HttpClient:<br/> *HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/> *NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty: <br/> *Bootstrap* ➜ *channel()*.

Similarly, we can easily configure other native implementations that still facilitate socket descriptors and *setsockopt*.
In the linked repository below, you will find such integrations, including binding with a native solution based on Netty *EpollSocketChannel*.

## Summary

Using the reflection mechanism and JNA, we were able to extend the configuration options of TCP/IP connections without too much work.
However, it is not an ideal solution. Some major drawbacks include:
- relying on Java implementation issues that may change over time (e.g. the movement of `fd` to the *DelegatingSocketImpl.delegate.fd* – JDK-8220493);
- using the reflection mechanism, which does not ensure security and we cannot always use it (security manager, `--illegal-access=deny` – Java 16);
- difficulty in providing support for multiple platforms, and in addition, not all systems provide similar configuration options nor in a similar way;
- difficulty in integration testing, system access (RAW_SOCK), or Packet Sniffer is needed.

We can remedy some of them by limiting the runtime environment to a proven configuration, e.g. by using Docker.
There is a reason why only widely implemented configuration options are supported by Java. Finally, if needed, in the same way,
we can implement the server-side configuration (*ServerSocket/ServerSocketChannel*).
