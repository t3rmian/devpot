---
title: Testowanie inicjalizacji klasy
url: testowanie-statycznej-inicjalizacji-klasy
id: 97
category:
  - java: Java
  - testing: Testy
tags:
  - classloading
  - junit
  - powermock
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

Logika zawarta w statycznym bloku inicjalizującym klasę nie jest łatwa do testowania.
Testy takie wymagają dodatkowych bibliotek bądź wykorzystania mechanizmu refleksji co znacznie wydłuża czas ich trwania i ich czytelność.
Czasami jednak refaktoryzacja nie wchodzi w grę. Problem może dotyczyć biblioteki zewnętrznej bądź też braku pierwotnych testów kodu *legacy*.
W takich momentach przydaje się znajomość możliwości przetestowania takiej logiki.

## Klasa z kodem statycznym

Szczególnie problematyczny kod zawierał będzie logikę warunkową zależną od parametrów środowiskowych.
Jako uproszczony przykład posłużę się najprostszą klasą z polem statycznym inicjalizowanym za pomocą parametru systemowego:
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
Celem testów będzie weryfikacja wartości tego parametru w zależności od różnych wartości wejściowych.
W rzeczywistości testowalibyśmy rezultat pewnej logiki zależnej od takiego parametru, często zawartej w bloku `static {/***/}`.

Problem z testowaniem takiego kodu wynika ze sposobu uruchomienia testów i ładowania klas.
Uruchamiając test, możemy być pewni, że klasa zostanie załadowana raz i nie przetestujemy logiki dla więcej niż jednego parametru wejściowego:

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

Kolejne testy mimo deklaracji w oddzielnych klasach komplikują problem, oczekując inicjalizacji inną wartością.
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

W zależności od kolejności/zestawu wywołania otrzymamy różne rezultaty.
Czasami możemy nawet doprowadzić do wysypania się innych testów.

```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="Wynik wywołania testów w odpowiedniej kolejności" title="Wynik wywołania testów w odpowiedniej kolejności">
<img src="/img/hq/test-class-initialization-order.png" alt="Wynik wywołania testów w nieodpowiedniej kolejności" title="Wynik wywołania testów w nieodpowiedniej kolejności">


## Oddzielna instancja JVM na test

Pewną nieelegancką sztuczką jest wymuszenie uruchomienia testów w oddzielnych instancjach maszyny wirtualnej Javy.
W ten sposób zapewnimy, że testowana klasa będzie ładowana raz na klasę deklarującą testy.
O ile rozwiązanie jest możliwe (np. poprzez konfigurację `forkCount` i `reuseForks` standardowej wtyczki `maven-surefire-plugin`) to nie jest optymalne.
Każdorazowe tworzenie oddzielnego procesu na potrzeby samego ładowania klas znacznie wydłuża czas wykonania testów.
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
Wywołując testy z poziomu IDE, warto w tym przypadku pamiętać o włączeniu delegacji wykonania testów do Mavena.

## Załadowanie klasy testowanej oddzielnym *ClassLoaderem*

Do podstawowych testów wykorzystać możemy jednak znajomość ładowania klas i standardowy interfejs *ClassLoadera*.
Wiemy, co chcemy osiągnąć – załadować ponownie klasę. O ile standardowy *ClassLoader* nie oferuje takiej funkcjonalności, to bez problemu
możemy ją zaimplementować na własną rękę.

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

Wiedząc, że testowana klasa będzie obecna w ścieżce *classpath* (zawartej w parametrze systemowym), wystarczy, użyjemy *URLClassLoadera*,
Ładowanie pozostałych klas oddelegujemy standardowo do *ClassLoadera*-rodzica. Mając załadowaną klasę, pole odczytamy za pomocą mechanizmu refleksji:

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

## Załadowanie klasy testowej oddzielnym *ClassLoaderem*

Jak możesz się domyślać, używanie refleksji nie będzie zbyt wygodne przy większej liczbie różnych odwołań do klasy.
Idąc o krok dalej, dlaczego by więc nie pozbyć się tego mechanizmu? Wystarczy, że klasę z testem załadujemy naszym ClassLoaderem.
Wtedy klasa testowa mogłaby zostać również automatycznie załadowana dzięki referencji.

Świetnym punktem wejściowym do realizacji takiego mechanizmu jest adnotacja `@RunWith`. 
Definiuje ona sposób wywołania testów, a korzystając ze standardowej implementacji, w swej prostocie pozwala właśnie na przekazanie klasy testowej.
Wystarczy, że podepniemy tu własny *ClassLoader*, nie zapominając o jego zamknięciu dopiero po zakończeniu testów.
Zbyt wczesne jego zamknięcie może spowodować niezaładowanie klasy, którą testujemy.
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

## Biblioteka PowerMock

Koniec końców możemy skorzystać z rozwiązania szytego na miarę, tj. biblioteki testowej PowerMock.

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

Już samo użycie runnera `org.powermock.modules.junit4.PowerMockRunner` powoduje załadowanie testu przy użyciu oddzielnego *ClassLoadera*.
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

Ewidentną wadą tego rozwiązania jest ponownie spory narzut czasowy związany z wykonaniem testów.
Z drugiej jednak strony narzędzie pomaga w wielu innych przypadkach testowych kodu legacy (np. *mockowanie* klas finalnych).

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

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="Wynik wywołania testów inicjalizacji klasy" title="Wynik wywołania testów inicjalizacji klasy">

> **Uwaga:** Powyższe przykłady korzystają z API JUnit 4, z którego często korzystają projekty *legacy*. W przypadku JUnit 5, przykłady uruchomisz z silnikiem *vintage*, a samo zachowanie (sposób ładowania klas testowych) zweryfikować możesz również za pomocą silnika *jupiter*.