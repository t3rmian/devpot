---
title: Java Foreign Linker API na przykładzie setsockopt
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

W [jednym z poprzednich artykułów](/pl/posty/java-opcje-natywne-socketu) pokazałem, w jaki sposób możemy wykorzystać deskryptor socketu w Javie, aby ustawić natywne opcje TCP/IP przy wykorzystaniu JNA
(Java Native Access). Propozycja ulepszenia JDK [JEP 389: Foreign Linker API (Incubator)](https://openjdk.java.net/jeps/389) zaimplementowana w wersji
JDK 16 jako dopełnienie Foreign-Memory Access API (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393),
wprowadza potężny interfejs pozwalający na interoperacyjność z bibliotekami C.

JEP 389 to moduł inkubacyjny (JEP 11) pod postacią pakietu `jdk.incubator.foreign`. Oznacza to, że interfejs nie jest jeszcze w fazie finalnej, ale już
w wesji JDK 16 możemy zacząć go testować. Sprawdźmy więc, jak będzie wyglądać wspomniana implementacja natywnych opcji socketu, gdy zamiast JNA
wykorzystamy FLA (Foreign Linker API).

## Foreign Linker API i setsockopt

Przed rozpoczęciem zabawy konieczne będzie dodanie modułu `jdk.incubator.foreign` do fazy kompilacji. Korzystając z Mavena,
wystarczy, że dodamy następujące parametry do wtyczki *maven-compiler-plugin*:

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

I już powinniśmy widzieć (IDE/kompilator) klasy nowego pakietu. Zaczniemy od klasy **CLinker**. Pomijając metody statyczne, na instancji tego obiektu
wywołać możemy dwie metody: ***downcallHandle*** i ***upcallStub***. Pierwsza pozwala właśnie na zmapowanie funkcji zewnętrznej (np. z biblioteki języka C),
natomiast druga na stworzenie wskaźnika na taką funkcję, który będziemy mogli przekazać do wywołania przez inną funkcję.

Do wywołania funkcji ***setsockopt*** skorzystamy właśnie z ***downcallHandle***. Potrzebować będziemy symbol funkcji, jej typ oraz deskryptor.
Argumenty te brzmią dosyć znajomo i poniższy kod na pewno będzie dla Ciebie zrozumiały: 

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

Do odnalezienia funkcji wystarczy skorzystać z instancji typu ***LibraryLookup***. Jeśli funkcja wchodzi w skład statycznych bibliotek
wymaganych przez maszyny wirtualnej, to możemy użyć statycznej metody fabrycznej ***ofDefault***. Alternatywnie, znając nazwę biblioteki, możemy ją załadować
za pomocą metody statycznej ***ofLibrary***.

Ostatecznie za pomocą deskryptora funkcji ***FunctionDescriptor*** oraz ***MethodType*** zdefiniujemy i zmapujemy argumenty jakie przyjmuje
szukana funkcja. Dzięki definicji wskaźnika ***CLinker.C_POINTER*** oraz interfejsowi ***MemoryAddress*** w prosty sposób oznaczymy argument jako
wskaźnik na pewien adres pamięci.

Równocześnie interfejs pozwala na zdefiniowanie referencji na globalną zmienną z wybranej biblioteki (np. na kod błędu ustawiany przez funkcje systemowe):

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

Wywołanie funkcji jest analogiczne jak w przypadku mechanizmu refleksji. W odróżnieniu jednak od JNA nie otrzymamy jednak wyjątku w przypadku
gdy funkcja natywna zakończy się z wartością niezerową. O uzyskanie kodu bądź opisu błędu musimy już zadbać sami:

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

Finalny kawałek kodu to alokacja natywnego kawałka pamięci **poza stertą**.
Taki segment możemy wykorzystać do ustawienia wartości opcji socketu.
Ostatecznie interfejs pozwala nam wyciągnąć adres segmentu i przekazać go do funkcji natywnej.

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

Przy uruchomieniu na Javie 16 dodatkowo konieczne będzie dodanie modułu do fazy uruchomieniowej i wyłączenie flagi `foreign.restricted` chroniącej przed nieoczekiwanym wykorzystaniem interfejsu.
Nieumiejętne wykorzystanie części nowego API może bowiem prowadzić do problemów ze stabilnością i błędami pamięci przed którymi jesteśmy zazwyczaj chronieni.
Mając to na uwadze oraz pamiętając o mechanizmie refleksji wykorzystanym do uzyskania deskryptora z poprzedniego artykułu,
konieczne będzie ustawienie następujących parametrów JVM:
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="Błędy w przypadku braku modułu przy kompilacji: &quot;java: package jdk.incubator.foreign is not visible&quot;, przy uruchomieniu: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;, brak flagi: &quot;java.lang.IllegalAccessError: Illegal access to restricted foreign method: CLinker.getInstance ; system property 'foreign.restricted' is set to 'deny'&quot;" title="Foreign Linker API: -Dforeign.restricted=warn">

## Podsumowanie

Foreign Linker API oraz Foreign-Memory Access API to obiecujące rozszerzenia JDK pozwalające na lepszą interoperacyjność
z bibliotekami C, oraz pamięcią natywną. Już w fazie inkubacyjnej oferują wiele możliwości do tej pory dostępnych jedynie
przy użyciu JNA/JNI oraz klasy `sun.misc.Unsafe`. Odnośnik do pełnego kod źródłowego opisanego w tym artykule
znajdziesz poniżej.