---
title: Testes de inicialização de classes/blocos estáticos
url: testes-inicializacao-classe-bloco-estatico
id: 97
category:
- java: Java
- testing: Testes
tags:
- classloading
- junit
- powermock
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

A lógica no bloco de inicialização de classe estática muitas vezes não é facilmente testável.
Tais testes exigem bibliotecas adicionais ou o uso de um mecanismo de reflexão, o que aumenta significativamente seus tempos de execução e legibilidade.
Às vezes, no entanto, a refatoração não é uma opção. Pode ser uma biblioteca externa ou um código legado que não possui testes prévios.
Ao encontrar tal problema, é bom saber como testar essa lógica estática.

## Classe com código estático
Um código particularmente problemático conterá lógica condicional dependendo de parâmetros ambientais.
Para simplificar, como exemplo, usarei uma classe com um campo estático inicializado com um parâmetro de sistema:
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
O objetivo dos testes será verificar o valor deste parâmetro em relação a diferentes valores de entrada.
Em um caso mais complexo, testaríamos o resultado de alguma lógica dependente de tal parâmetro/condição ambiental, muitas vezes contida no bloco `static {/***/}`.

O problema com o teste de tal código decorre da forma como os testes/classes são carregados.
Ao executar o teste, podemos ter certeza de que a classe será carregada uma vez.
Você não conseguirá testar a lógica para mais de um parâmetro de entrada:

```java
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runners.MethodSorters;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;


@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class SomeStaticInitializationClassATest {
    @Test
    public void testGetFoo_A() {
        System.setProperty("FOO", "A");
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }

    @Test
    public void testGetFoo_B_SameClassLoader() {
        System.setProperty("FOO", "B");
        assertNotEquals("B", SomeStaticInitializationClass.FOO);
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }
}
```

Testes subsequentes, apesar de declarações em classes separadas, complicam ainda mais o problema.
Você pode esperar uma classe inicializada de forma diferente.
```java
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

public class SomeStaticInitializationClassBTest {
    @Test
    public void testGetFoo_B_SameClassloader() {
        System.setProperty("FOO", "B");
        assertNotEquals("B", SomeStaticInitializationClass.FOO);
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }
}
```

Dependendo da ordem dos testes (ou da suíte de testes), você obterá resultados diferentes.
Às vezes, você pode até quebrar outros testes ao introduzir um novo.
```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="O resultado da invocação dos testes na ordem correta" title="O resultado da invocação dos testes na ordem correta">
<img src="/img/hq/test-class-initialization-order.png" alt="Resultado da invocação de testes na ordem errada" title="Resultado da invocação de testes na ordem errada">


## Instância de JVM separada por teste

Um truque é forçar os testes a serem executados em instâncias separadas da Máquina Virtual Java.
Dessa forma, você pode garantir que a classe testada será carregada uma vez por classe que declara os testes.
Embora a solução seja possível (por exemplo, configurando o `forkCount` e `reuseForks` do `maven-surefire-plugin` padrão), ela não é ótima.
Cada vez que um processo separado é criado para o propósito de carregar classes, o tempo de execução do teste aumenta significativamente.
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <version>2.16</version>
    <configuration>
        <forkCount>1</forkCount>
        <reuseForks>false</reuseForks>
    </configuration>
</plugin>
```
Lembre-se de ativar a delegação da execução de testes para o Maven ao invocar testes diretamente através do IDE.
Em geral, aproveite o forking para paralelização e aceleração dos testes, em vez de tentar contornar o problema de carregamento de classes.

## Carregando a classe testada usando um ClassLoader separado

Para testes básicos, no entanto, podemos usar o conhecimento sobre o carregamento de classes e a interface padrão *ClassLoader*.
Sabemos o que queremos alcançar – recarregar a classe. Embora o *ClassLoader* padrão não ofereça tal funcionalidade,
você pode facilmente estendê-lo para sua necessidade.

```java
import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;

class TestClassLoader extends URLClassLoader {

    private final Class<?>[] filteredClasses;

    public TestClassLoader(ClassLoader parent, Class<?> ...filteredClasses) {
        super(getClassPath(), parent);
        this.filteredClasses = filteredClasses;
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        for (Class<?> filteredClass : filteredClasses) {
            if (filteredClass.getName().equals(name)) {
                Class<?> c = this.findLoadedClass(name);
                if (c == null) {
                    c = this.findClass(name);
                }

                if (resolve) {
                    this.resolveClass(c);
                }

                return c;
            }
        }
        return super.loadClass(name, resolve);
    }

    private static URL[] getClassPath() {
        String classpath = System.getProperty("java.class.path");
        String[] entries = classpath.split(File.pathSeparator);
        URL[] result = new URL[entries.length];
        try {
            for (int i = 0; i < entries.length; i++) {
                result[i] = Paths.get(entries[i]).toAbsolutePath().toUri().toURL();
            }
        } catch (MalformedURLException e) {
            throw new RuntimeException();
        }
        return result;
    }
}
```

Sabendo que a classe testada está presente no *classpath* (contido no parâmetro de sistema), só precisamos usar o *URLClassLoader*.
Veja a superclasse para os detalhes de carregamento e inverta a delegação.
Designe o carregamento das classes restantes para o *ClassLoader* pai. Tendo a classe carregada, podemos ler o campo estático usando o mecanismo de reflexão:

```java

import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runners.MethodSorters;

import java.io.IOException;
import java.lang.reflect.Field;
import java.net.URLClassLoader;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;


@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class SomeStaticInitializationClassATest {
    //...
    @Test
    public void testGetFoo_B_SeparateClassLoader() throws IOException, ClassNotFoundException, NoSuchFieldException, IllegalAccessException {
        System.setProperty("FOO", "B");
        assertEquals("B", getClassField(SomeStaticInitializationClass.class, "FOO"));
    }

    private Object getClassField(Class<?> loadedClass, String name) throws IOException, ClassNotFoundException, NoSuchFieldException, IllegalAccessException {
        try (URLClassLoader urlClassLoader = new TestClassLoader(getClass().getClassLoader(), loadedClass)) {
            Class<?> aClass = urlClassLoader.loadClass(loadedClass.getName());
            Field declaredField = aClass.getDeclaredField(name);
            return declaredField.get(null);
        }
    }
}
```

## Carregando a classe de teste usando um ClassLoader separado

Como você pode imaginar, a reflexão não é muito conveniente, especialmente se você quiser referenciar mais campos ou inicializar um objeto.
Indo um passo adiante, por que não se livrar desse problema? Se você carregar a classe de teste através de um *ClassLoader* personalizado, a classe de teste também será puxada pelo mesmo *ClassLoader*.

O melhor ponto de partida para isso é a anotação `@RunWith`.
Ela define o mecanismo para invocar os testes.
Estender a implementação padrão permite que você simplesmente passe a classe de teste em seu construtor.
Tudo o que temos que fazer é conectar nosso próprio *ClassLoader* aqui, lembrando de fechá-lo somente após o término dos testes.
Fechá-lo muito cedo pode resultar no não carregamento da classe sob teste.

```java
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runner.notification.RunNotifier;
import org.junit.runners.BlockJUnit4ClassRunner;
import org.junit.runners.model.InitializationError;
import org.junit.runners.model.Statement;

import static org.junit.Assert.assertEquals;

@RunWith(SomeStaticInitializationClassCTest.SeparateClassLoaderTestRunner.class)
public class SomeStaticInitializationClassCTest {
    @Test
    public void testGetFoo_C_SeparateTestClassLoader() {
        System.setProperty("FOO", "C");
        assertEquals("C", SomeStaticInitializationClass.FOO);
    }

    public static class SeparateClassLoaderTestRunner extends BlockJUnit4ClassRunner {
        private static final TestClassLoader testClassLoader = new TestClassLoader(SeparateClassLoaderTestRunner.class.getClassLoader(),
                SomeStaticInitializationClassCTest.class, SomeStaticInitializationClass.class);
        
        public SeparateClassLoaderTestRunner(Class<?> clazz) throws InitializationError, ClassNotFoundException {
            super(testClassLoader.loadClass(clazz.getName()));
        }

        @Override
        protected Statement classBlock(RunNotifier notifier) {
            Statement statement = super.classBlock(notifier);
            return new Statement() {
                @Override
                public void evaluate() throws Throwable {
                    try {
                        statement.evaluate();
                    } finally {
                        testClassLoader.close();
                    }
                }
            };
        }
    }
}
```

## Biblioteca PowerMock

Finalmente, vamos dar uma olhada em uma solução sob medida para o problema, ou seja, a biblioteca de testes PowerMock.

```xml
<dependency>
    <groupId>org.powermock</groupId>
    <artifactId>powermock-module-junit4</artifactId>
    <version>2.0.9</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.powermock</groupId>
    <artifactId>powermock-api-mockito2</artifactId>
    <version>2.0.9</version>
    <scope>test</scope>
</dependency>
```

Apenas usando o runner `org.powermock.modules.junit4.PowerMockRunner`, você fará com que a classe de teste seja carregada por um *ClassLoader* separado.

```java
import org.junit.Test;
import org.junit.runner.RunWith;
import org.powermock.modules.junit4.PowerMockRunner;

import static org.junit.Assert.assertEquals;

@RunWith(PowerMockRunner.class)
public class SomeStaticInitializationClassETest {
    @Test
    public void testGetFoo_E_SeparatePowerMockClassLoader() {
        System.setProperty("FOO", "E");
        assertEquals("E", SomeStaticInitializationClass.FOO);
    }
}
```

A desvantagem óbvia desta solução é, novamente, a considerável sobrecarga de tempo associada à execução dos testes.
Por outro lado, a ferramenta ajuda em muitos outros casos de teste legados (por exemplo, mockar classes final).

```java
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
        SomeStaticInitializationClassCTest.class,
        SomeStaticInitializationClassDTest.class,
        SomeStaticInitializationClassETest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="O resultado da invocação dos testes de inicialização de classe" title="O resultado da invocação dos testes de inicialização de classe">

> **Nota:** Os exemplos acima usam a API do JUnit 4, que muitas vezes corresponde aos frameworks de teste existentes em projetos legados. Para o JUnit 5, você pode usá-lo com o motor vintage ou verificar o comportamento (carregamento da classe de teste) com o motor jupiter.
