---
title: Pruebas de inicialización de clase/bloque estático
url: static-block-class-initialization-tests
id: 97
category:
  - java: Java
  - testing: Pruebas
tags:
  - classloading
  - junit
  - powermock
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

La lógica en el bloque de inicialización estática de una clase suele ser difícil de testear.
Estas pruebas requieren librerías adicionales o el uso de reflexión, lo que aumenta el tiempo de ejecución y reduce la legibilidad.
A veces, sin embargo, refactorizar no es una opción. Puede ser una librería externa o código legacy sin tests previos.
Cuando te encuentres con este problema, es útil saber cómo probar esa lógica estática.

## Clase con código estático
El código problemático suele tener lógica condicional según parámetros de entorno.
Para simplificar, usaré una clase con un campo estático inicializado con un parámetro de sistema:
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
El objetivo de los tests será verificar el valor de este parámetro con diferentes valores de entrada.
En un caso más complejo, probaríamos el resultado de lógica dependiente de ese parámetro/condición de entorno, a menudo en el bloque `static {/***/}`.

El problema al testear este código viene de cómo se cargan los tests/clases.
Al ejecutar el test, la clase se carga una sola vez.
No podrás probar la lógica para más de un parámetro de entrada:

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

Las pruebas siguientes, aunque estén en clases separadas, complican aún más el problema.
Puedes esperar una clase inicializada de forma diferente.
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

Según el orden de los tests (o suite) obtendrás resultados distintos.
A veces incluso puedes romper otros tests al añadir uno nuevo.
```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="El resultado de ejecutar los tests en el orden correcto" title="El resultado de ejecutar los tests en el orden correcto">
<img src="/img/hq/test-class-initialization-order.png" alt="Resultado de ejecutar los tests en el orden incorrecto" title="Resultado de ejecutar los tests en el orden incorrecto">


## Instancia JVM separada por test

Un truco es forzar que los tests se ejecuten en instancias separadas de la JVM.
Así, puedes asegurar que la clase bajo prueba se cargue una vez por clase de test.
Aunque es posible (por ejemplo, configurando `forkCount` y `reuseForks` en el `maven-surefire-plugin` estándar), no es óptimo.
Cada vez se crea un proceso separado para cargar clases, lo que aumenta mucho el tiempo de ejecución.
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
Recuerda activar la delegación de ejecución de tests a Maven al ejecutarlos desde el IDE.
En general, usa el forking para paralelizar y acelerar los tests, no para evitar el problema de carga de clases.

## Cargar la clase bajo prueba con un ClassLoader separado

Para tests básicos, podemos usar el conocimiento de carga de clases y la interfaz estándar *ClassLoader*.
Sabemos lo que queremos: recargar la clase. Aunque el *ClassLoader* estándar no lo permite,
puedes extenderlo fácilmente para tu caso.

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

Sabiendo que la clase bajo prueba está en el *classpath* (parámetro del sistema), solo hay que usar *URLClassLoader*.
Consulta la superclase para detalles de carga e invierte la delegación.
Delega la carga de las demás clases al *ClassLoader* padre. Con la clase cargada, podemos leer el campo estático usando reflexión:

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

## Cargar la clase de test con un ClassLoader separado

Como puedes imaginar, la reflexión no es muy cómoda, sobre todo si quieres referenciar más campos o inicializar un objeto.
Un paso más allá: ¿por qué no evitar este problema? Si cargas la clase de test con un *ClassLoader* personalizado, la clase de test también será cargada por ese *ClassLoader*.

El mejor punto de partida es la anotación `@RunWith`.
Define el mecanismo para invocar los tests.
Extender la implementación estándar permite pasar la clase de test en el constructor.
Solo hay que enganchar nuestro *ClassLoader* aquí, recordando cerrarlo solo al terminar los tests.
Cerrar demasiado pronto puede hacer que la clase bajo prueba no se cargue.

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

## Librería PowerMock

Por último, veamos una solución hecha a medida: la librería de tests PowerMock.

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

Solo con usar el runner `org.powermock.modules.junit4.PowerMockRunner`, la clase de test se cargará con un *ClassLoader* separado.

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

La desventaja obvia es, de nuevo, el considerable overhead de tiempo de ejecución de los tests.
Por otro lado, la herramienta ayuda en muchos otros casos legacy (por ejemplo, mockear clases final).

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

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="El resultado de ejecutar los tests de inicialización de clase" title="El resultado de ejecutar los tests de inicialización de clase">

> **Nota:** Los ejemplos usan la API de JUnit 4, que suele coincidir con los frameworks de test de proyectos legacy. Para JUnit 5, puedes usarlo con el engine vintage o verificar el comportamiento (carga de clase de test) con el engine jupiter.
