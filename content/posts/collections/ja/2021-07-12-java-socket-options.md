---
title: Javaソケットのネイティブオプション
url: java-ソケット-ネイティブ-オプション
id: 70
category:
- java: Java
tags:
- ネイティブ
author: Damian Terlecki
date: 2021-07-12T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

Javaが提供する範囲を超えたTCP/IPオプションを適用する必要がある場合、いくつかの選択肢があります。

1. [RockSaw](https://www.savarese.com/software/rocksaw/)ライブラリ – SOCK_RAWタイプのソケットを作成でき、
   TCP/IP処理をスキップします。このソリューションにより、かなり低レベルで独自のプロトコルを実装できます。
   このようなソケットの作成には管理者権限が必要です。
2. 追加のTCP/IPオプションを設定できるカスタムインターフェースの実装 – さまざまなオペレーティングシステムは、Javaが提供するもの以外の
   追加の設定オプションを提供しています。このようなソリューションには、*java.net/java.nio*パッケージに代わる外部ライブラリの使用、
   またはJNI（Java Native Interface）やJNA（Java Native Access）を使用した独自の実装が含まれます。
3. 標準のJavaパッケージを再利用し、追加の設定のためにJNI/JNAバインディングと組み合わせる。

これらの3つのオプションには、さまざまなレベルの複雑さが伴います。適切なソリューションを選択し、
保守の実現可能性、移植性（クロスプラットフォームサポート）、エラーの起こりやすさなど、長所と短所を考慮することが重要です。

残念ながら、*RockSaw*以外に、標準ソケットを使用した通信のための実績のあるライブラリは見つかりませんでした。
さらに、リフレクションメカニズムだけでは、JNIメソッドに見られる設定の制約をバイパスすることはできません。
それでは、Javaの能力を超えるTCP/IPオプションを拡張するために、最も時間のかからない選択肢としてオプション3を考えてみましょう。

<img src="/img/hq/java-ip-dont-fragment.png" alt="Wireshark – DFフラグが0に設定されている" title="Wireshark – DFフラグが0に設定されている">

## setsockopt

Windows、Linux、およびBSDでは、TCP/IPオプションはC言語の*setockopt*関数を使用して設定されます。
この関数は、ソケットと、選択されたTCP/IPレイヤーのプロトコルとその値を示すオプションレベルを渡すことを期待しています。
ソケットはファイルディスクリプタに相当し、システム上のリソースの一意の識別子を定義します。

`java.net.Socket`および`java.nio.channels.SocketChannel`に関連する標準Javaクラスの**実装**を分析すると、
次のクラスでそのようなディスクリプタへの参照を見つけることができます。
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`

コードをさらに深く見ると、ディスクリプタは*SocketChannel.open()*を介してチャネルを開く/作成する際に設定されることがわかります。
*Socket*の作成の場合、それは*bind/connect()*操作中に行われます。
最後に、（TCP/IP）オプションは、Javaのバージョンに固有の[ネイティブメソッド](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528)を介して設定されます。
最終的に、呼び出しは関連するディスクリプタを設定する*setsockopt*関数に委譲されます。

## Java ➜ *setsockopt*

TCP/IPオプションがどのように設定されるかを知ったので、拡張機能の実装に進むことができます。
最も簡単な方法は、ソケットディスクリプタへの参照を取得することです。
その後、TCP/IPオプションは、独自のネイティブメソッド呼び出しを介してこのディスクリプタに直接適用できます。
これにより、Javaコードから通常の方法でソケットを引き続き使用できます。

### JNA

一番下から始めましょう。JNAを使用して、*setsockopt*関数呼び出しを実装するCライブラリをロードします。
JNAアプローチは、JNIでネイティブのグルーコードを書くよりもはるかに簡単で安全なアプローチです。
*pom.xml*（Maven）ファイルに次の依存関係を追加します。

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

我々の例はLinuxシステム用です。Windows用の同等のコードは、ページ下部のリポジトリにあります。
Linuxの場合、ソケット設定を実装するライブラリは**libc**と呼ばれます。このライブラリは（`lib`プレフィックスを削除して）ロードし、
JNAを使用してJavaインターフェースとして公開できます。

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

JNAを使用すると、ライブラリのインターフェースを非常に明確に定義できます。私たちのニーズには、*setsockopt*関数だけが必要です。
さらに、個々のヘッダーファイルにあるいくつかの設定パラメータを定義します。
例えば、IP DF（Don't Fragment）フラグとIP TTL（Time To Live）値を設定してみましょう。

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

Linuxの場合、バージョン2.2以降、DFフラグはIP_MTU_DISCOVERオプションにIP_PMTUDISC_DONT値を渡すことで有効にできます。
JNAを使用してCライブラリから関数を呼び出すのは非常に簡単です。JNAがバッファ参照の渡し方をいかに簡素化しているかに注目してください。
比較のために、C関数は次のようになります。

```java
extern int setsockopt (
        int __fd,
        int __level,
        int __optname,
        const void *__optval,
        socklen_t __optlen
       ) __THROW;
```

### ファイルディスクリプタ

さて、ソケットディスクリプタだけが必要です。残念ながら、標準のJavaパッケージの場合、このディスクリプタは
インターフェースの一部ではありません。手っ取り早い方法として、リフレクションメカニズムを使用できます。
ただし、実装に変更があった場合、Javaのバージョンをアップグレードするとエラーにつながる可能性があることに注意してください。

実際のリファレンスは、*FileDescriptor*クラスの`fd`フィールドにあります。

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

*FileDescriptor*オブジェクトは、前述のように、*Socket*または*SocketChannel*の特定の実装から取得できます。

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

### 設定

通常、設定を定義するためには何らかのビルダーが使用されます。
より関数的なアプローチでは、設定関数を介してオプションを適用します。

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

### クライアントインターフェース

静的ファクトリメソッドを使用して、プラットフォーム固有の実装を取得できます。

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

このインターフェースのクライアントとして、実装の詳細に立ち入ることなくソケットチャネルを設定できるようになりました。

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

最終的に、これを特定のクライアントやライブラリに簡単に接続できます。この実装を注入できるいくつかのヒント：
- Apache HttpClient:<br/> *HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/> *NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty: <br/> *Bootstrap* ➜ *channel()*.

同様に、ソケットディスクリプタと*setsockopt*をまだ利用する他のネイティブ実装を簡単に設定できます。
以下のリンクされたリポジトリでは、Netty *EpollSocketChannel*に基づくネイティブソリューションとのバインディングを含む、そのような統合が見つかります。

## まとめ

リフレクションメカニズムとJNAを使用して、あまり手間をかけずにTCP/IP接続の設定オプションを拡張できました。
しかし、これは理想的な解決策ではありません。いくつかの主な欠点があります。
- 時間の経過とともに変更される可能性のあるJavaの実装の問題に依存している（例：`fd`の*DelegatingSocketImpl.delegate.fd*への移動 – JDK-8220493）。
- セキュリティを確保できず、常に使用できるわけではないリフレクションメカニズムを使用している（セキュリティマネージャ、`--illegal-access=deny` – Java 16）。
- 複数のプラットフォームのサポートを提供することが困難であり、さらに、すべてのシステムが同様の設定オプションを同様の方法で提供しているわけではない。
- 統合テスト、システムアクセス（RAW_SOCK）、またはパケットスニファが必要であり、困難である。

Dockerを使用するなど、ランタイム環境を実績のある設定に制限することで、これらのいくつかを改善できます。
Javaでサポートされているのは、広く実装されている設定オプションのみであるのには理由があります。最後に、必要であれば、同じ方法で
サーバー側の設定（*ServerSocket/ServerSocketChannel*）を実装できます。

