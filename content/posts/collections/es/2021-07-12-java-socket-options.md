---
title: Opciones nativas de Socket en Java
url: java-socket-native-options
id: 70
category:
- java: Java
  # "Java" se mantiene como término estándar
tags:
  - native
  # "native" se mantiene como término técnico habitual
author: Damian Terlecki
date: 2021-07-12T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

Cuando necesitamos aplicar opciones TCP/IP más allá de las que ofrece Java, tenemos varias opciones:

1. La librería [RockSaw](https://www.savarese.com/software/rocksaw/) – permite crear un socket de tipo SOCK_RAW, saltándose el procesamiento TCP/IP. Esta solución permite una implementación de bajo nivel de tu propio protocolo. Crear un socket así requiere privilegios de administrador.
2. Una implementación de interfaz personalizada que permita establecer opciones TCP/IP adicionales – varios sistemas operativos ofrecen opciones de configuración más allá de las que proporciona Java. Esto implica usar una librería externa, alternativa a los paquetes *java.net/java.nio*, o implementar la tuya propia usando JNI (Java Native Interface) o JNA (Java Native Access).
3. Reutilizar los paquetes estándar de Java y combinarlos con binding JNI/JNA para configuración adicional.

Estas tres opciones tienen distintos niveles de complejidad. Es importante elegir la solución adecuada y considerar pros y contras, como la viabilidad de mantenimiento, portabilidad (soporte multiplataforma) y propensión a errores.

Lamentablemente, aparte de *RockSaw*, no encontré una librería probada para comunicación usando sockets estándar. Además, usando solo reflexión, no podemos saltarnos las restricciones de configuración de los métodos JNI. Consideremos entonces la opción 3 como la menos costosa en tiempo para ampliar las opciones TCP/IP más allá de lo que permite Java.

<img src="/img/hq/java-ip-dont-fragment.png" alt="Wireshark – DF flag set to 0" title="Wireshark – DF flag set to 0">

## setsockopt

En Windows, Linux y BSD las opciones TCP/IP se configuran usando la función C *setsockopt*. Esta función espera que le pasemos un socket, el nivel de opción que indica el protocolo de la capa TCP/IP seleccionada y su valor. El socket equivale a un file descriptor, que es un identificador único del recurso en el sistema.

Analizando la **implementación** de las clases estándar de Java relacionadas con `java.net.Socket` y `java.nio.channels.SocketChannel`, encontramos referencias a estos descriptores en las siguientes clases:
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`;
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`.

Si miramos más a fondo el código, veremos que el descriptor se establece al abrir/crear el canal mediante *SocketChannel.open()*. En el caso de crear un *Socket*, se hace durante la operación *bind/connect()*. Finalmente, las opciones (TCP/IP) se establecen mediante un [método nativo](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528), específico de la versión de Java. En última instancia, la llamada se delega a la función *setsockopt*, que configura el descriptor correspondiente.

## Java ➜ *setsockopt*

Sabiendo cómo se configuran las opciones TCP/IP, podemos pasar a la implementación de nuestra extensión. Lo más sencillo será obtener la referencia al descriptor del socket. Después, las opciones TCP/IP pueden aplicarse directamente a este descriptor mediante nuestra propia invocación nativa. Así, podremos seguir usando el socket normalmente desde el código Java.

### JNA

Empecemos desde lo más básico. Usaremos JNA para cargar una librería C que implemente la llamada a *setsockopt*. JNA es un enfoque mucho más simple y seguro que escribir código nativo en JNI. Añadiremos la siguiente dependencia al archivo *pom.xml* (Maven):

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

Nuestro ejemplo será para un sistema Linux. El código equivalente para Windows puede encontrarse en el repositorio al final de la página. En Linux, la librería que implementa la configuración de sockets se llama **libc**. Esta librería puede cargarse (eliminando el prefijo `lib`) y exponerse como interfaz Java usando JNA:

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

JNA nos permite definir la interfaz de la librería de forma muy clara. Para nuestro caso, solo necesitamos la función *setsockopt*. Además, definimos algunos parámetros de configuración encontrados en los headers. Por ejemplo, probemos a establecer el flag IP DF (Don't Fragment) y el valor IP TTL (Time To Live).

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

En Linux, desde la versión 2.2, el flag DF puede activarse pasando la opción IP_MTU_DISCOVER con el valor IP_PMTUDISC_DONT. Llamar a una función de una librería C con JNA es muy sencillo. Observa cómo JNA simplifica el paso de un buffer por referencia. Para comparar, la función C es así:

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

Ahora solo necesitamos el descriptor del socket. Lamentablemente, en los paquetes estándar de Java, este descriptor no forma parte de la interfaz. Como atajo, podemos usar reflexión. Ten en cuenta que si cambia la implementación, esto puede causar errores al actualizar la versión de Java.

La referencia real está en el campo `fd` de la clase *FileDescriptor*:

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

El objeto *FileDescriptor* puede obtenerse, como se mencionó antes, de la implementación específica de *Socket* o *SocketChannel*:

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

### La configuración

Normalmente, se usa algún tipo de builder para definir la configuración. Un enfoque más funcional consiste en aplicar las opciones mediante una función de configuración:

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

### Interfaz cliente

Con un método de fábrica estático podemos obtener una implementación específica para nuestra plataforma:

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

Como cliente de esta interfaz, ahora podemos configurar el canal de socket sin preocuparnos de la implementación:

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

En definitiva, podemos conectarlo fácilmente a cualquier cliente o librería. Algunos ejemplos donde se podría inyectar esta implementación:
- Apache HttpClient:<br/> *HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/> *NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty: <br/> *Bootstrap* ➜ *channel()*.

De forma similar, podemos configurar otras implementaciones nativas que sigan facilitando descriptores de socket y *setsockopt*. En el repositorio enlazado abajo encontrarás integraciones así, incluyendo binding con una solución nativa basada en Netty *EpollSocketChannel*.

## Resumen

Usando reflexión y JNA, pudimos ampliar las opciones de configuración de conexiones TCP/IP sin demasiado esfuerzo. Sin embargo, no es una solución ideal. Algunos inconvenientes importantes son:
- depender de detalles de implementación de Java que pueden cambiar con el tiempo (por ejemplo, el movimiento de `fd` a *DelegatingSocketImpl.delegate.fd* – JDK-8220493);
- usar reflexión, que no garantiza seguridad y no siempre puede usarse (security manager, `--illegal-access=deny` – Java 16);
- dificultad para soportar múltiples plataformas, y además, no todos los sistemas ofrecen opciones de configuración similares ni de la misma forma;
- dificultad para pruebas de integración, se necesita acceso al sistema (RAW_SOCK) o un sniffer de paquetes.

Podemos mitigar algunos de estos problemas limitando el entorno de ejecución a una configuración probada, por ejemplo usando Docker. Hay una razón por la que solo las opciones de configuración ampliamente implementadas están soportadas por Java. Finalmente, si es necesario, de la misma forma podemos implementar la configuración del lado servidor (*ServerSocket/ServerSocketChannel*).
