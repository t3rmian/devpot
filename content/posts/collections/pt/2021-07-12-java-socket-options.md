---
title: Opções nativas de Socket em Java
url: java-opcoes-nativas-de-socket
id: 70
category:
- java: Java
tags:
  - nativo
    author: Damian Terlecki
    date: 2021-07-12T20:00:00
    source: https://github.com/t3rmian/setsockopt-java-demo
---

Quando precisamos aplicar opções TCP/IP além das oferecidas pelo Java, temos várias opções para escolher:

1. A biblioteca [RockSaw](https://www.savarese.com/software/rocksaw/) – permite criar um soquete do tipo SOCK_RAW, pulando o processamento TCP/IP. Esta solução permite uma implementação de baixo nível do seu próprio protocolo. A criação de tal soquete requer privilégios de administrador.
2. Uma implementação de interface personalizada que permite definir opções TCP/IP adicionais – vários sistemas operacionais oferecem algumas opções de configuração adicionais além das fornecidas pelo Java. Tal solução envolve o uso de uma biblioteca externa, alternativa aos pacotes *java.net/java.nio*, ou a implementação de uma própria usando JNI (Java Native Interface) ou JNA (Java Native Access).
3. Reutilizar os pacotes padrão do Java e combiná-los com a vinculação JNI/JNA para configuração adicional.

Essas três opções vêm com níveis variados de complexidade. É importante escolher a solução certa e levar em consideração os prós e contras, entre outras coisas, a viabilidade de manutenção, portabilidade (suporte multiplataforma) e propensão a erros.

Infelizmente, além do *RockSaw*, não encontrei uma biblioteca comprovada para comunicação usando soquetes padrão. Além disso, usando apenas o mecanismo de reflexão, não conseguimos contornar as restrições de configuração encontradas nos métodos JNI. Vamos então considerar a opção 3 como a que consome menos tempo para estender as opções TCP/IP além das capacidades do Java.

<img src="/img/hq/java-ip-dont-fragment.png" alt="Wireshark – Flag DF definida para 0" title="Wireshark – Flag DF definida para 0">

## setsockopt

No Windows, Linux e BSD, as opções TCP/IP são configuradas usando a função da linguagem C *setockopt*. Esta função espera que passemos um soquete, bem como o nível da opção, indicando o protocolo da camada TCP/IP selecionada e seu valor. O soquete é equivalente a um descritor de arquivo, que define um identificador único do recurso no sistema.

Analisando a **implementação** das classes padrão do Java relacionadas a `java.net.Socket` e `java.nio.channels.SocketChannel`, podemos encontrar referências a tais descritores nas seguintes classes:
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`;
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`.

Olhando mais a fundo no código, veremos que o descritor é definido durante a abertura/criação do canal através do *SocketChannel.open()*. No caso da criação de um *Socket*, é feito durante a operação *bind/connect()*. Finalmente, as opções (TCP/IP) são definidas através de um [método nativo](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528), específico da versão do Java. Por fim, a chamada é delegada à função *setsockopt*, que configura o descritor relacionado.

## Java ➜ *setsockopt*

Sabendo como as opções TCP/IP são configuradas, podemos prosseguir para a implementação da nossa extensão. A maneira mais fácil será obter a referência ao descritor do soquete. Depois disso, as opções TCP/IP podem ser aplicadas diretamente a este descritor através da nossa própria invocação de método nativo. Desta forma, ainda seremos capazes de usar o soquete da maneira usual a partir do código Java.

### JNA

Vamos começar de baixo. Usaremos a JNA para carregar uma biblioteca C que implementa a chamada da função *setsockopt*. A abordagem JNA é muito mais simples e segura do que escrever código de cola nativo em JNI. Adicionaremos a seguinte dependência ao arquivo *pom.xml* (Maven):

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

Nosso exemplo será para um sistema Linux. O código equivalente para Windows pode ser encontrado no repositório na parte inferior da página. No caso do Linux, a biblioteca que implementa a configuração do soquete é chamada **libc**. Esta biblioteca pode ser carregada (removendo o prefixo `lib`) e exposta como uma interface Java usando JNA:

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

A JNA nos permite definir a interface da biblioteca de uma forma muito clara. Para nossas necessidades, só precisamos da função *setsockopt*. Além disso, definimos alguns parâmetros de configuração encontrados nos arquivos de cabeçalho individuais. Por exemplo, vamos tentar definir a flag IP DF (Don't Fragment) e o valor IP TTL (Time To Live).

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

No caso do Linux, a partir da versão 2.2, a flag DF pode ser ativada passando a opção IP_MTU_DISCOVER com o valor IP_PMTUDISC_DONT. Chamar uma função de uma biblioteca C com JNA é muito simples. Note como a JNA simplifica a passagem de uma referência de buffer. Para comparação, a função C se parece com isto:

```java
extern int setsockopt (
        int __fd,
        int __level,
        int __optname,
        const void *__optval,
        socklen_t __optlen
       ) __THROW;
```

### Descritor de Arquivo

Agora só precisamos do nosso descritor de soquete. Infelizmente, no caso dos pacotes padrão do Java, este descritor não faz parte da interface. Pegando atalhos, podemos usar o mecanismo de reflexão. Note, no entanto, que em caso de mudanças na implementação, isso pode levar a erros quando a versão do Java for atualizada.

A referência real está no campo `fd` da classe *FileDescriptor*:

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

O objeto *FileDescriptor* pode ser obtido, como mencionado anteriormente, da implementação específica de *Socket* ou *SocketChannel*:

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

### A Configuração

Normalmente, algum tipo de construtor (builder) é usado para definir a configuração. Uma abordagem mais funcional envolve a aplicação das opções através da função de configuração:

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

### Interface do Cliente

Com um método de fábrica estático, podemos obter uma implementação específica para a nossa plataforma:

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

Como cliente desta interface, podemos agora configurar o canal de soquete sem nos aprofundarmos na implementação:

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

Finalmente, podemos conectá-lo facilmente a um determinado cliente ou biblioteca. Algumas dicas de onde esta implementação poderia ser injetada:
- Apache HttpClient:<br/> *HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/> *NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty: <br/> *Bootstrap* ➜ *channel()*.

Da mesma forma, podemos facilmente configurar outras implementações nativas que ainda facilitam descritores de soquete e *setsockopt*. No repositório vinculado abaixo, você encontrará tais integrações, incluindo a vinculação com uma solução nativa baseada no *EpollSocketChannel* do Netty.

## Resumo

Usando o mecanismo de reflexão e JNA, conseguimos estender as opções de configuração de conexões TCP/IP sem muito trabalho. No entanto, não é uma solução ideal. Algumas grandes desvantagens incluem:
- depender de questões de implementação do Java que podem mudar com o tempo (por exemplo, a movimentação de `fd` para *DelegatingSocketImpl.delegate.fd* – JDK-8220493);
- usar o mecanismo de reflexão, que não garante segurança e nem sempre podemos usá-lo (gerenciador de segurança, `--illegal-access=deny` – Java 16);
- dificuldade em fornecer suporte para múltiplas plataformas e, além disso, nem todos os sistemas fornecem opções de configuração semelhantes ou de maneira semelhante;
- dificuldade em testes de integração, acesso ao sistema (RAW_SOCK) ou um Packet Sniffer é necessário.

Podemos remediar alguns deles limitando o ambiente de tempo de execução a uma configuração comprovada, por exemplo, usando Docker. Há uma razão pela qual apenas as opções de configuração amplamente implementadas são suportadas pelo Java. Finalmente, se necessário, da mesma forma, podemos implementar a configuração do lado do servidor (*ServerSocket/ServerSocketChannel*).
