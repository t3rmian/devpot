---
title: Java Foreign Linker API en acción
url: java-foreign-linker-api-setsockopt
id: 72
category:
- java: Java
  # "Java" se mantiene como término estándar
tags:
  - native
  # "native" se mantiene como término técnico habitual
author: Damian Terlecki
date: 2021-08-08T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

En [uno de mis artículos anteriores](/posts/java-socket-native-options), mostré cómo podemos usar un descriptor de socket Java para establecer opciones TCP/IP nativas usando JNA (Java Native Access). Recientemente, la propuesta de mejora de JDK [JEP 389: Foreign Linker API (Incubadora)](https://openjdk.java.net/jeps/389), implementada en JDK 16 como complemento de la Foreign-Memory Access API (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393), introdujo otra interfaz potente que permite una gran interoperabilidad con librerías C.

JEP 389 es en realidad un módulo de incubación (JEP 11) en forma del paquete `jdk.incubator.foreign`. Esto significa que la interfaz aún no está finalizada, pero en JDK 16 ya podemos probar esta funcionalidad. Veamos cómo podría ser la implementación de opciones nativas de socket cuando se reemplaza JNA por FLA (Foreign Linker API).

## Foreign Linker API y setsockopt

Para preparar el entorno, necesitaremos añadir el módulo `jdk.incubator.foreign` a la fase de compilación. Usando Maven, basta con añadir los siguientes parámetros al *maven-compiler-plugin*:

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

Esto nos dará visibilidad (en el IDE/compilador) de las clases del nuevo paquete. Empezaremos con la clase **CLinker**. Además de los métodos estáticos, en una instancia de este objeto encontramos dos métodos: ***downcallHandle*** y ***upcallStub***. El primero permite mapear una función externa (por ejemplo, de una librería C), mientras que el segundo puede usarse para crear un puntero a dicha función, que luego puede pasarse a otra función.

Para llamar a la función C ***setsockopt***, usaremos el método ***downcallHandle***. Para ello, necesitaremos buscar el símbolo de la función y definir su tipo y descriptor. Estos argumentos son relevantes, y el siguiente código seguramente te resultará comprensible:

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

La función de la librería puede buscarse mediante una instancia de ***LibraryLookup***. Si la función es parte de librerías estáticas enlazadas a la máquina virtual, podemos usar el método estático ***ofDefault***. Alternativamente, conociendo el nombre de la librería, podemos cargarla usando el método estático ***ofLibrary***.

Finalmente, usamos ***MethodType*** para definir y ***FunctionDescriptor*** para enlazar los parámetros de la función. Observa cómo ***CLinker.C_POINTER*** indica el puntero ***MemoryAddress*** a una dirección de memoria.

A la vez, la interfaz permite definir una referencia a una variable global de una librería seleccionada (por ejemplo, a un código de error establecido por una función del sistema):

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

La llamada a la función es igual que con el mecanismo de reflexión. Sin embargo, a diferencia de JNA, no obtendremos una excepción cuando una función nativa termine con valor distinto de cero. Debemos implementar explícitamente la obtención del código/mensaje de error, igual que en código nativo:

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

La última parte de la lógica es la asignación de memoria nativa. Observa que esto ocurre **fuera del heap**. El segmento asignado puede usarse para establecer el valor de la opción del socket. Finalmente, la interfaz expone la dirección de memoria nativa para usar en las funciones C.

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

Al ejecutarlo en Java 16, hay un paso adicional necesario. El flag `foreign.restricted` previene el uso inesperado de algunas partes de esta API. Esto puede provocar caídas o corrupción de memoria si no se maneja con cuidado. Teniendo esto en cuenta, así como el mecanismo de reflexión usado para obtener el descriptor en el artículo anterior, los parámetros JVM para ejecutar el programa serían:
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="Falta el módulo durante la compilación: &quot;java: package jdk.incubator.foreign is not visible&quot;, en tiempo de ejecución: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;, flag faltante: &quot;java.lang.IllegalAccessError: Illegal access to restricted foreign method: CLinker.getInstance ; system property 'foreign.restricted' is set to 'deny'&quot;" title="Foreign Linker API: -Dforeign.restricted=warn">

## Resumen

Foreign Linker API y Foreign Memory Access API son mejoras muy prometedoras del JDK. Proporcionan una interoperabilidad increíble con librerías C y memoria nativa. En fase de incubación, ofrecen muchas posibilidades que hasta ahora solo estaban disponibles usando código JNA/JNI o la clase `sun.misc.Unsafe`. Si quieres ver el código fuente completo de este ejemplo, puedes consultarlo en el repositorio al final de la página.
