---
title: 静的ブロック/クラス初期化のテスト
url: 静的ブロック-クラス初期化-テスト
id: 97
category:
- java: Java
- testing: テスト
tags:
- クラスローディング
- junit
- powermock
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

静的クラス初期化ブロック内のロジックは、テストが容易でないことがよくあります。
このようなテストには、追加のライブラリやリフレクションメカニズムの使用が必要となり、実行時間と可読性を著しく損ないます。
しかし、リファクタリングが選択肢にない場合もあります。外部ライブラリであったり、事前のテストがないレガシーコードであったりするかもしれません。
このような問題に遭遇した場合、そのような静的ロジックをテストする方法を知っておくと良いでしょう。

## 静的コードを持つクラス
特に問題となるコードには、環境パラメータに依存する条件付きロジックが含まれます。
簡単にするため、例として、システムパラメータで初期化される静的フィールドを持つクラスを使用します。
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
テストの目的は、異なる入力値に対してこのパラメータの値を検証することです。
より複雑なケースでは、`static {/***/}`ブロックに含まれることが多い、そのようなパラメータ/環境条件に依存する何らかのロジックの結果をテストします。

このようなコードのテストにおける問題は、テストやクラスがロードされる方法に起因します。
テストを実行することで、クラスが一度ロードされることは確実です。
複数の入力パラメータに対してロジックをテストすることはできません。

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

後続のテストは、別のクラスで宣言されているにもかかわらず、問題をさらに複雑にします。
異なる初期化されたクラスを期待するかもしれません。
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

テストの順序（またはテストスイート）によって、異なる結果が得られます。
時には、新しいテストを導入することで他のテストを壊してしまうことさえあります。
```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="正しい順序でテストを呼び出した結果" title="正しい順序でテストを呼び出した結果">
<img src="/img/hq/test-class-initialization-order.png" alt="誤った順序でテストを呼び出した結果" title="誤った順序でテストを呼び出した結果">


## テストごとに別のJVMインスタンス

一つのトリックは、テストをJava仮想マシンの別々のインスタンスで実行させることです。
これにより、テスト対象のクラスがテストを宣言するクラスごとに一度ロードされることを保証できます。
この解決策は可能ですが（例えば、標準の`maven-surefire-plugin`の`forkCount`と`reuseForks`を設定することで）、最適ではありません。
クラスをロードする目的で別々のプロセスが作成されるたびに、テストの実行時間は大幅に増加します。
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
IDEを通じて直接テストを呼び出す場合は、テストの実行をMavenに委譲することを忘れないでください。
一般的に、クラスローディングの問題を回避しようとするのではなく、並列化とテストの高速化のためにフォークを活用してください。

## 別のClassLoaderを使用してテスト対象クラスをロードする

しかし、基本的なテストでは、クラスローディングの知識と標準の*ClassLoader*インターフェースを利用できます。
達成したいことはわかっています。クラスをリロードすることです。標準の*ClassLoader*はそのような機能を提供していませんが、
必要に応じて簡単に拡張できます。

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

テスト対象のクラスが*classpath*（システムパラメータに含まれる）に存在することを知っているので、*URLClassLoader*を使用するだけです。
ロードの詳細についてはスーパークラスを参照し、委譲を逆にします。
残りのクラスのロードは親*ClassLoader*に委譲します。ロードされたクラスがあれば、リフレクションメカニズムを使用して静的フィールドを読み取ることができます。

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

## 別のClassLoaderを使用してテストクラスをロードする

ご想像のとおり、リフレクションはあまり便利ではありません。特に、より多くのフィールドを参照したり、オブジェクトを初期化したりしたい場合はなおさらです。
一歩進んで、この問題を解消してみませんか？カスタム*ClassLoader*を介してテストクラスをロードすれば、テストクラスも同じ*ClassLoader*によってプルされます。

これに最適な出発点は`@RunWith`アノテーションです。
これはテストを呼び出すメカニズムを定義します。
標準の実装を拡張することで、コンストラクタでテストクラスを渡すだけで済みます。
私たちが行う必要があるのは、独自の*ClassLoader*をここにフックすることだけで、テストが終了した後にのみ閉じることを忘れないでください。
早すぎると、テスト対象のクラスがロードされない可能性があります。

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

## PowerMockライブラリ

最後に、問題に対する特注の解決策、すなわちPowerMockテストライブラリを見てみましょう。

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

`org.powermock.modules.junit4.PowerMockRunner`ランナーを使用するだけで、テストクラスが別の*ClassLoader*によってロードされるようになります。

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

このソリューションの明らかな欠点は、やはりテストの実行に伴うかなりの時間的オーバーヘッドです。
一方、このツールは他の多くのレガシーテストケース（例えば、finalクラスのモック化）で役立ちます。

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

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="クラス初期化テストを呼び出した結果" title="クラス初期化テストを呼び出した結果">

> **注:** 上記の例では、レガシープロジェクトの既存のテストフレームワークにしばしば適合するJUnit 4 APIを使用しています。JUnit 5では、ビンテージエンジンで使用するか、jupiterエンジンで（テストクラスのロードに関する）振る舞いを検証できます。
