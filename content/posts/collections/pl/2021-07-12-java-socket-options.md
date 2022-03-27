---
title: Opcje natywne socketu w Javie
url: java-opcje-natywne-socketu
id: 70
category:
- java: Java
tags:
  - native
author: Damian Terlecki
date: 2021-07-12T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

Jeśli w naszej aplikacji potrzebujemy ustawić dodatkowe opcje TCP/IP ponad te oferowane przez Javę to do wyboru mamy kilka opcji.
1. Biblioteka [RockSaw](https://www.savarese.com/software/rocksaw/) – pozwala stworzenie socketu typu SOCK_RAW z pominięciem warstwy transportowej/sieciowej i danych.
Rozwiązanie te pozwala na dosyć niskopoziomową implementację obsługi własnego protokołu. Utworzenie tego typu socketu wymaga uprawnień administratorskich.
2. Własna implementacja interfejsu pozwalająca na ustawienie dodatkowych opcji TCP/IP – różne systemy operacyjne oferują dodatkowe opcje konfiguracyjne
ponad te oferowane przez Javę. Rozwiązanie takie wiąże się z wykorzystaniem alternatywnej do pakietu *java.net/java.nio* biblioteki zewnętrznej bądź implementację
własnej przy użyciu JNI (Java Native Interface) lub JNA (Java Native Access) pod wybrany system.
3. Wykorzystanie standardowych pakietów Javy i podpięcie JNI/JNA jedynie w wybranych miejscach na potrzeby dodatkowej konfiguracji.

Używając samego mechanizmu refleksji, nie jesteśmy w stanie obejść ograniczeń konfiguracyjnych, które znajdują się w metodach JNI.
Trzy powyższe opcje wiążą się z różnego poziomu złożonością. Ważną kwestią jest wybór pasującego rozwiązania i rozważenie wszystkich za i przeciw,
między innymi pod względem utrzymania, przenośności (wsparcia dla wielu platform) i podatności na błędy.

Niestety, oprócz *RockSaw* nie znalazłem sprawdzonej biblioteki do komunikacji przy pomocy socketów standardowych typów. 
Rozpatrzmy więc opcję 3, jako najmniej czasochłonną do aplikacji dodatkowych opcji TCP/IP podczas połączenia internetowego.

<img src="/img/hq/java-ip-dont-fragment.png" alt="Wireshark – flaga natywna DF warstwy IP ustawiona na 0" title="Wireshark – flaga natywna DF warstwy IP ustawiona na 0">

## setsockopt

W systemach Windows, Linux, jak i BSD opcje TCP/IP możemy skonfigurować przy pomocy funkcji biblioteki systemowej języka C *setsockopt*.
Do niej właśnie musimy przekazać socket, poziom opcji wskazujący na protokół wybranej warstwy TCP/IP oraz jej wartość. Socket jest tutaj
równoznaczny z deskryptorem pliku, czyli unikalnym identyfikatorem zasobu w systemie.

Analizując **implementację** standardowych klas Javy powiązanych z socketami `java.net.Socket` i `java.nio.channels.SocketChannel`, referencje do takich deskryptorów
odnajdziemy w następujących klasach:
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`;
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`.

Przeglądając kod głębiej, dostrzeżemy, że deskryptor ustawia się przy otwieraniu/tworzeniu kanału *SocketChannel.open()*. W przypadku socketu
odbywa się to natomiast przy operacji *bind/connect()*. Finalnie opcje (TCP) ustawiane są za pomocą
[metody natywnej](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528),
zależnej od wersji Javy. Ostatecznie wywołanie delegowane jest właśnie do funkcji *setsockopt*, która konfiguruje powiązany deskryptor.

## Java ➜ *setsockopt*

Wiedząc już, w jaki sposób następuje konfiguracja opcji TCP/IP możemy przystąpić do implementacji naszej nakładki.
Najprostszym sposobem będzie uzyskanie referencji do utworzonego deskryptora socketu i ustawienie interesujących nas opcji TCP/IP za pomocą własnej metody natywnej.
W ten sposób z socketu ciągle będziemy mogli korzystać w standardowy sposób z poziomu kodu Javy.

### JNA

Zacznijmy więc od samego dołu. Do implementacji wywołania funkcji *setsockopt* załadujemy bibliotekę JNA. Jest to znacznie prostsza alternatywa dla pisania
kodu natywnego JNI. Do pliku *pom.xml* (maven) zaciągniemy następujące zależności:

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

Przykład oparty będzie o system Linux. Odpowiednik kodu dla Windowsa znajdziesz w repozytorium na dole strony. Biblioteka, w której znajduje się
implementacja konfiguracji socketów, nosi nazwę **libc**. Taką bibliotekę załadujemy przy pomocy JNA w następujący sposób:

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

JNA w bardzo przejrzysty sposób pozwala nam zdefiniować interfejs biblioteki. Na nasze potrzeby, wystarczy nam funkcja *setsockopt* oraz parametry
z poszczególnych plików nagłówkowych, którymi jesteśmy zainteresowani. Dla przykładu postaramy się ustawić flagę IP DF (Don't Fragment) oraz czas życia IP TTL (Time To Live).

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

W przypadku Linuksa, od wersji 2.2 włącznie, flagę DF (fragmentację) możemy włączyć, przekazując opcję IP_MTU_DISCOVER z wartością IP_PMTUDISC_DONT.
Wywołanie funkcji z biblioteki C dzięki JNA jest bardzo proste. Warto zwrócić uwagę na sposób przekazywanie referencji do bufora. Dla
porównania, funkcja w języku C wygląda następująco:

```java
extern int setsockopt (
        int __fd,
        int __level,
        int __optname,
        const void *__optval,
        socklen_t __optlen
       ) __THROW;
```

### Deskryptor pliku

Do szczęścia brakuje nam tylko deskryptora naszego socketu. Niestety, w przypadku standardowych pakietów Javy, deskryptor ten
nie jest częścią interfejsu. Idąc na skróty, możemy skorzystać z mechanizmu refleksji, ale w razie zmian w samej implementacji
może to być zgubne przy aktualizacji wersji Javy.

Przede wszystkim, właściwą referencją, której potrzebujemy, jest pole `fd` w klasie *FileDescriptor*:

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

Obiekt typu *FileDescriptor* uzyskamy, tak jak wcześniej wspominałem, z właściwej implementacji *Socket* bądź *SocketChannel*:

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

### Konfiguracja

Do wyboru ustawienia dodatkowo zaimplementowanych opcji natywnych można skorzystać ze wzorca budowniczego.
Podejście bliższe programowaniu funkcyjnemu obejmuje aplikację opcji za pomocą funkcji konfiguracyjnej:

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

### Wykorzystanie

Wisienką na torcie będzie statyczna metoda fabryczna pozwalająca na utworzenie implementacji właściwej dla danej platformy:

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

W prosty sposób utworzymy skonfigurowany kanał bez zagłębiania się w implementację:

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

Ostatecznie, w zależności gdzie potrzebujemy tej konfiguracji, możemy ją w prsoty sposób podpiąć pod wybranego klienta bądź bibliotekę:
- Apache HttpClient:<br/>*HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/>*NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty:<br/>*Bootstrap* ➜ *channel()*.

Na podobnej zasadzie w prosty sposób skonfigurujemy również inne natywne połączenia mające podobny zarys implementacyjny.
W załączonym repozytorium znajdziesz integrację z natywnym rozwiązaniem bazującym na Netty *EpollSocketChannel*.

## Podsumowanie

Korzystając z mechanizmu refleksji oraz JNA, niewielkim kosztem jesteśmy w stanie rozszerzyć opcje konfiguracyjne połączeń TCP/IP.
Nie jest to jednak rozwiązanie idealne. Do wad zaliczyć można:
- bazowanie na kwestiach implementacyjnych Javy, które mogą się z czasem zmieniać (np. przesunięcie `fd` do *DelegatingSocketImpl.delegate.fd* – JDK-8220493);
- wykorzystanie mechanizmu refleksji, który nie zapewnia bezpieczeństwa i nie zawsze możemy z niego skorzystać (security manager, `--illegal-access=deny` – Java 16);
- trudność w zapewnieniu wsparcia dla wielu platform, a dodatkowo nie wszystkie systemy zapewniają podobne opcje konfiguracyjne i w podobny sposób;
- trudność w testowaniu integracyjnym, potrzebny jest dostęp systemowy (RAW_SOCK) bądź Packet Sniffer.

Na część z nich możemy zaradzić, ograniczając środowisko uruchomieniowe do sprawdzonej konfiguracji np. poprzez wykorzystanie Dockera.
Nie bez powodu jedynie szeroko zaimplementowane opcje konfiguracyjne są wspierane przez Javę. Ostatecznie, w razie potrzeb, w analogiczny sposób
możemy zaimplementować konfigurację po stronie serwera (*ServerSocket/ServerSocketChannel*).