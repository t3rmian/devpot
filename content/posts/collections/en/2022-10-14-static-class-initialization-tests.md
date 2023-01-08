---
title: Static block/class initialization tests
url: static-block-class-initialization-tests
id: 97
category:
  - java: Java
  - testing: Testing
tags:
  - classloading
  - junit
  - powermock
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

The logic in the static class initialization block is often not easily testable.
Such tests require additional libraries or the use of a reflection mechanism, which significantly extends their run times and readability.
Sometimes, however, refactoring is not an option. It might be an external library or a legacy code that has no prior tests.
When encountering such an issue, it is good to know how to test such static logic.

## Class with a static code
Particularly problematic code will contain conditional logic depending on environmental parameters.
To simplify, as an example, I will use a class with a static field initialized with a system parameter:
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
The aim of the tests will be to verify the value of this parameter against different input values.
In a more complex case, we would test the result of some logic dependent on such a parameter/environment condition, often contained in the `static {/***/}` block.

The problem with testing such code stems from the way the tests/classes are loaded.
By running the test, we can be sure that the class will be loaded once.
You won't be able to test the logic for more than one input parameter:

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

Subsequent tests, despite declarations in separate classes, further complicate the problem.
You may expect a differently initialized class.
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

Depending on the order of tests (or test suite) you will get different results.
Sometimes you might even break other tests by introducing a new one.
```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="The result of invoking the tests in the correct order" title="The result of invoking the tests in the correct order">
<img src="/img/hq/test-class-initialization-order.png" alt="Result of invoking tests in the wrong order" title="Result of invoking tests in the wrong order">


## Separate JVM instance per test

One trick is to force the tests to run in separate instances of the Java Virtual Machine.
This way, you can ensure that the tested class will be loaded once per class declaring the tests.
While the solution is possible (e.g. by configuring the `forkCount` and` reuseForks` of the standard `maven-surefire-plugin`) it is suboptimal.
Each time a separate process is created for the purpose of loading classes, the test execution time increases significantly.
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
Remember to turn on the delegation of test execution to Maven when invoking tests directly through the IDE.
In general, do leverage forking for parallelization and speeding up the tests instead of trying to work around the class loading issue.

## Loading the tested class using a separate ClassLoader

For basic tests, however, we can use the knowledge of class loading and the standard *ClassLoader* interface.
We know what we want to achieve – reload the class. While the standard *ClassLoader* does not offer such functionality,
you can easily extend it to your need.

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

Knowing that the tested class is present in the *classpath* (contained in the system parameter), we just need to use the *URLClassLoader*.
See the superclass for the details for loading, and invert the delegation.
Designate the loading of the remaining classes to the parent *ClassLoader*. Having the loaded class, we can read the static field using the reflection mechanism:

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

## Loading the test class using a separate ClassLoader

As you can guess, reflection is not very convenient, especially if you want to reference more fields or initialize an object.
Going one step further, why not get rid of this issue? If you load the test class through a custom *ClassLoader*, then the test class will also be pulled by the same *ClassLoader*.

The best starting point for this is the `@RunWith` annotation.
It defines the mechanism for invoking the tests.
Extending the standard implementation, allows you to simply pass the test class in its constructor.
All we have to do is hook our own *ClassLoader* here, remembering to close it only after testing is over.
Closing it too early may result in the class under the test not being loaded.

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

## PowerMock library

Finally, let's have a look at a tailor-made solution to the problem, i.e. the PowerMock test library.

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

Just by using the `org.powermock.modules.junit4.PowerMockRunner` runner, you will cause the testing class to be loaded by a separate *ClassLoader*.

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

The obvious disadvantage of this solution is, again, the considerable time overhead associated with the execution of the tests.
On the other hand, the tool helps in many other legacy test cases (e.g. mocking final classes).

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

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="The result of invoking the class initialization tests" title="The result of invoking the class initialization tests">

> **Note:** The above examples use the JUnit 4 API that often matches legacy projects' existing test frameworks. For JUnit 5, you can use it with the vintage engine or verify the behavior (test class loading) with the jupiter engine.