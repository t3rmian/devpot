---
title: Java Foreign Linker APIの実践
url: java-foreign-linker-api-setsockopt
id: 72
category:
- java: Java
tags:
- ネイティブ
author: Damian Terlecki
date: 2021-08-08T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

[以前の記事](/posts/java-socket-native-options)の一つで、JNA (Java Native Access) を使ってJavaソケットディスクリプタでネイティブTCP/IPオプションを設定する方法を紹介しました。
最近、JDK 16でForeign-Memory Access API (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393)の補完として実装されたJDK拡張提案 [JEP 389: Foreign Linker API (Incubator)](https://openjdk.java.net/jeps/389) は、
Cライブラリとの優れた相互運用性を可能にする、さらに強力なインターフェースを導入しました。

JEP 389は、実際には`jdk.incubator.foreign`パッケージの形で提供されるインキュベーションモジュール(JEP 11)です。これは、インターフェースがまだ最終版ではないことを意味しますが、
JDK 16ではすでにこの機能をテストできます。それでは、JNAをFLA (Foreign Linker API)に置き換えた場合、ネイティブソケットオプションの実装がどのようになるか見てみましょう。

## Foreign Linker APIとsetsockopt

プレイグラウンドをセットアップするために、コンパイルフェーズに`jdk.incubator.foreign`モジュールを追加する必要があります。Mavenを使用する場合、
*maven-compiler-plugin*に以下のパラメータを追加するだけです。

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

これにより、IDE/コンパイラで新しいパッケージのクラスが見えるようになります。まず**CLinker**クラスから始めます。
静的メソッドを除き、このオブジェクトのインスタンスには***downcallHandle***と***upcallStub***という2つのメソッドがあります。
前者は外部関数（例：Cライブラリから）をマッピングでき、
後者はそのような関数へのポインタを作成するために使用でき、後で別の関数に渡すことができます。

C言語の***setsockopt***関数を呼び出すには、***downcallHandle***メソッドを使用します。このためには、関数シンボルを検索し、
その型とディスクリプタを定義する必要があります。
これらの引数は非常に関連性が高く、以下のコードはきっと理解できるでしょう。

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

ライブラリ関数は***LibraryLookup***インスタンスを通じて検索できます。関数が仮想マシンにリンクされた静的ライブラリの一部である場合、
***ofDefault***静的ファクトリメソッドを使用できます。あるいは、ライブラリ名がわかっている場合は、***ofLibrary***静的メソッドを使用してロードできます。

最後に、***MethodType***を使用して定義し、***FunctionDescriptor***で関数パラメータをリンクします。
***CLinker.C_POINTER***が、何らかのメモリアドレスへの***MemoryAddress***ポインタを示していることに注目してください。

同時に、このインターフェースは、選択されたライブラリからグローバル変数への参照を定義することもできます（例：システム関数によって設定されるエラーコードへ）。

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

関数の呼び出しはリフレクションメカニズムと同じです。ただし、JNAとは異なり、ネイティブ関数がゼロ以外の値で終了しても例外は発生しません。
ネイティブコードと同様に、エラーコードやメッセージの取得を明示的に実装する必要があります。

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

最後のロジックはネイティブメモリの割り当てです。これは**ヒープ外**で発生することに注意してください。
割り当てられたセグメントは、ソケットオプションの値を設定するために使用できます。
最終的に、インターフェースはC関数で使用するためにネイティブメモリアドレスを公開します。

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

Java 16で実行する場合、追加のステップが必要です。`foreign.restricted`フラグは、このAPIの一部の予期しない使用を防ぎます。
これらは、注意深く扱わないとクラッシュやメモリ破損を引き起こす可能性があります。
これを念頭に置き、前の記事でディスクリプタを取得するために使用したリフレクションメカニズムも考慮すると、
プログラムを実行できるJVMパラメータは次のようになります。
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="コンパイル時のモジュール欠落: &quot;java: package jdk.incubator.foreign is not visible&quot;、実行時: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;、フラグ欠落: &quot;java.lang.IllegalAccessError: Illegal access to restricted foreign method: CLinker.getInstance ; system property 'foreign.restricted' is set to 'deny'&quot;" title="Foreign Linker API: -Dforeign.restricted=warn">

## まとめ

Foreign Linker APIとForeign Memory Access APIは、非常に有望なJDKの機能強化です。
これらはCライブラリやネイティブメモリとの素晴らしい相互運用性を提供します。
インキュベーション段階では、これまでJNA / JNIグルーコードや`sun.misc.Unsafe`クラスを使用してのみ利用可能だった多くの可能性を提供します。
このサンプルの完全なソースコードを見たい場合は、ページ下部のリポジトリをご覧ください。
