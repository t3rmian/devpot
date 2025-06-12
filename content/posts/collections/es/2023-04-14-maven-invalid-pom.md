---
title: POM inválido por una propiedad Maven no resuelta
url: maven-invalid-pom
id: 108
category:
  - java: Java
tags:
  - maven
  - jaxws
  - jakarta
author: Damian Terlecki
date: 2023-04-14T20:00:00
---

Maven utiliza el archivo de configuración `pom.xml` para gestionar el build del proyecto. Al analizar el archivo,
la herramienta resuelve las dependencias y determina qué librerías y herramientas se requieren para compilar los artefactos.
En el proceso, Maven también analiza POMs externos para determinar dependencias transitivas.

## Propiedad Maven no resuelta

Puede ocurrir que un POM de una librería remota contenga errores, más lógicos que sintácticos.
Una de las causas es el uso de expresiones que hacen referencia a [propiedades de Maven](https://maven.apache.org/pom.html#Properties) inexistentes.
Si hay errores durante el procesamiento de dependencias, Maven omite la carga de artefactos transitivos y muestra una advertencia como esta:

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details' alt='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details'>

Verás rápidamente que las dependencias declaradas en el `pom.xml` de la librería básicamente se ignoran y no se resuelven en el proyecto.
Para saber más sobre la causa, añade el parámetro `-X`, que es una forma abreviada de `--debug`.

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' for com.sun:tools:jar must specify an absolute path but is ${tools.jar} @

En este caso, Maven no puede evaluar la expresión `${tools.jar}`.
Al revisar los archivos `pom.xml`, vemos que esta expresión se usa para definir la dependencia de sistema `tools` en uno de los POMs padre:

```xml
<!--...-->
<profiles>
    <!--...-->
    <profile>
        <id>default-tools.jar</id>
        <activation>
            <file>
                <exists>${java.home}/../lib/tools.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../lib/tools.jar</tools.jar>
        </properties>
    </profile>
    <profile>
        <id>default-tools.jar-mac</id>
        <activation>
            <file>
                <exists>${java.home}/../Classes/classes.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../Classes/classes.jar</tools.jar>
        </properties>
    </profile>
</profiles>
<!--...-->
<dependencyManagement>
    <dependencies>
        <!-- JDK dependencies -->
        <dependency>
            <groupId>com.sun</groupId>
            <artifactId>tools</artifactId>
            <version>1.6</version>
            <scope>system</scope>
            <systemPath>${tools.jar}</systemPath>
        </dependency>
    </dependencies>
    <!--...-->
</dependencyManagement>
<!--...-->
```

Tras revisar las dependencias de este artefacto, puedes concluir que la dependencia de sistema no se usa en este submódulo.
Sin embargo, la ausencia del archivo en `${java.home}/../lib/tools.jar` o `${java.home}/../Classes/classes.jar` deja la variable `${tools.jar}` sin inicializar.

En este ejemplo, el problema está relacionado con JDK 11+. En esta versión, las herramientas mencionadas han sido eliminadas.
Este cambio está soportado desde `jaxws-rt:2.3.x`, lo que implica una actualización de especificación relevante para esta librería.

En general, el problema es más amplio y se puede extrapolar a cualquier situación donde Maven no pueda evaluar una expresión al resolver dependencias externas.
¿Tenemos alguna influencia sobre esto?

## Evaluación de expresiones en el archivo POM

El orden de evaluación de fuentes de propiedades está implementado en [`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175) para Maven v3/4 y se puede simplificar así:
- Propiedades Java – `-Dkey=value`;
- Propiedades Maven – `<properties><key>value</key></properties>`;
- Variables de entorno – `set/export key=value`.

En un proyecto multi-módulo, las propiedades Maven pueden heredarse por los submódulos del mismo proyecto. Sin embargo, estas variables no se propagan automáticamente a las dependencias externas.
Por otro lado, las variables Java y de entorno se inicializan al inicio del procesamiento de Maven, así que añadirlas durante la ejecución no afecta la evaluación.
Además, en el caso de dependencias externas, las variables Java se consolidan al nivel de variables de entorno ([MNG-7563](https://issues.apache.org/jira/browse/MNG-7563)).

Sabiendo esto, puedes inicializar una propiedad Maven en el `pom.xml` externo de varias formas, por ejemplo:
- Variable de entorno (cuidado con los problemas al exportar variables con puntos en sistemas tipo Unix);
- Propiedad Java usando la línea de comandos `mvn -Dkey=value validate`;
- Variable de entorno al inicio del comando `key=value mvn validate`;
- Archivo de configuración Maven relativo al proyecto `.mvn/maven.config` que define la propiedad Java `-Dkey=value`;
- Comandos globales en, por ejemplo, `~/.mavenrc` que definen la variable de entorno `set/export key=value` (cuidado con problemas en IntelliJ, por ejemplo, [IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner)).

El último recurso es descargar manualmente (o indirectamente) la dependencia y añadirla a los paths de compilación/build del artefacto.

> Como herramienta alternativa, Gradle v4-8 lo gestiona un poco mejor. No lanza error para dependencias no afectadas y los artefactos se importan correctamente.
