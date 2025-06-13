---
title: A API Foreign Linker do Java em ação
url: java-foreign-linker-api-setsockopt
id: 72
category:
- java: Java
tags:
  - nativo
author: Damian Terlecki
date: 2021-08-08T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

Em [um dos meus artigos anteriores](/posts/java-socket-native-options), mostrei como podemos usar um descritor de soquete Java para definir algumas opções nativas de TCP/IP usando JNA (Java Native Access). Recentemente, a proposta de aprimoramento do JDK [JEP 389: Foreign Linker API (Incubator)](https://openjdk.java.net/jeps/389) implementada no JDK 16 como um complemento à API de Acesso à Memória Estrangeira (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393), introduziu mais uma interface poderosa que permite uma grande interoperabilidade com bibliotecas C.

A JEP 389 é, na verdade, um módulo de incubação (JEP 11) na forma do pacote `jdk.incubator.foreign`. Isso significa que a interface ainda não está finalizada, mas no JDK 16 já podemos testar esse recurso. Então, vamos ver como a implementação de opções de soquete nativas poderia se parecer quando a JNA for substituída pela FLA (Foreign Linker API).

## Foreign Linker API e setsockopt

Para montar nosso ambiente de testes, precisaremos adicionar o módulo `jdk.incubator.foreign` à fase de compilação. Usando o Maven, basta adicionar os seguintes parâmetros ao *maven-compiler-plugin*:

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

Isso deve nos fornecer a visibilidade (no IDE/compilador) das classes do novo pacote. Começaremos com a classe **CLinker**. Exceto pelos métodos estáticos, em uma instância deste objeto, podemos encontrar dois métodos: ***downcallHandle*** e ***upcallStub***. O primeiro permite mapear uma função externa (por exemplo, de uma biblioteca C), enquanto o outro pode ser usado para criar um ponteiro para tal função, que pode ser posteriormente passado para outra função.

Para chamar a função C ***setsockopt***, usaremos o método ***downcallHandle***. Para isso, precisaremos procurar o símbolo da função e definir seu tipo e descritor. Estes argumentos são bastante relevantes, e o código a seguir certamente será compreensível para você:

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

A função da biblioteca pode ser procurada através da instância ***LibraryLookup***. Se a função faz parte de bibliotecas estáticas vinculadas à máquina virtual, podemos usar o método de fábrica estático ***ofDefault***. Alternativamente, sabendo o nome da biblioteca, podemos carregá-la usando o método estático ***ofLibrary***.

Finalmente, usamos o ***MethodType*** para definir e o ***FunctionDescriptor*** para vincular os parâmetros da função. Note como o ***CLinker.C_POINTER*** indica o ponteiro ***MemoryAddress*** para algum endereço de memória.

Ao mesmo tempo, a interface permite que você defina uma referência a uma variável global de uma biblioteca selecionada (por exemplo, para um código de erro definido por uma função do sistema):

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

A chamada da função é a mesma que no mecanismo de reflexão. No entanto, ao contrário da JNA, não receberemos uma exceção quando uma função nativa sair com um valor diferente de zero. Temos que implementar explicitamente a recuperação do código/mensagem de erro, assim como no código nativo:

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

A peça final da lógica é a alocação de memória nativa. Note que isso acontece **fora do heap**. O segmento alocado pode então ser usado para definir o valor da opção de soquete. Por fim, a interface expõe o endereço de memória nativa para uso nas funções C.

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

Quando executado no Java 16, há um passo adicional necessário. A flag `foreign.restricted` impede o uso inesperado de algumas partes desta API. Isso pode resultar em travamentos ou corrupção de memória se não for manuseado com cuidado. Tendo isso em mente, assim como o mecanismo de reflexão usado para obter o descritor no artigo anterior, os parâmetros da JVM que permitem a execução do nosso programa seriam assim:
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="Módulo ausente durante a etapa de compilação: &quot;java: o pacote jdk.incubator.foreign não está visível&quot;, durante a execução: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;, flag ausente: &quot;java.lang.IllegalAccessError: Acesso ilegal a método estrangeiro restrito: CLinker.getInstance ; a propriedade do sistema 'foreign.restricted' está definida como 'deny'&quot;" title="Foreign Linker API: -Dforeign.restricted=warn">

## Resumo

A Foreign Linker API e a Foreign Memory Access API são aprimoramentos muito promissores do JDK. Elas fornecem uma interoperabilidade incrível com bibliotecas C e memória nativa. Na fase de incubação, elas oferecem muitas possibilidades até então disponíveis apenas usando código de cola JNA / JNI e a classe `sun.misc.Unsafe`. Se você quiser dar uma olhada no código-fonte completo deste exemplo, confira o repositório na parte inferior da página.
