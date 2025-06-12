---
title: Consejos sobre Filtering Classloader en WebLogic
url: weblogic-library-conflicts
id: 92
category:
  - jee: JEE
tags:
  - classloading
  - weblogic
author: Damian Terlecki
date: 2022-08-07T20:00:00
---

Si buscas una forma de hacer que WebLogic cargue versiones específicas de dependencias incluidas en tu aplicación, aquí tienes algunos consejos para no perder la cabeza:
1. WebLogic, como servidor de aplicaciones, viene con muchas librerías que quizá también uses en tu app (posiblemente versiones distintas).
2. WebLogic sigue la delegación estándar de classloader. La clase solicitada se busca primero (preferida) por el sistema, luego el parent y el classloader de la aplicación.
3. Filtering Class Loader es una funcionalidad de WebLogic que permite al deployer influir en este proceso e invertir partes del mismo. Así puedes lograr una carga similar a Tomcat.

Puedes usar el filtering class loader al desplegar una aplicación WAR o EAR. Se usan dos descriptores distintos según el tipo de archivo:
- weblogic-application.xml (EAR);
- weblogic.xml (WAR).

## Descriptor EAR

Para EAR, encontrarás un XSD correspondiente en [la lista de versiones de schema](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-application/index.html).
Cambia el mapping `xsi:schemaLocation` por una versión que coincida con tu WLS. Ahora, en el descriptor,
las opciones importantes son `prefer-application-packages` y `prefer-application-resources`.

La primera se usa para configurar clases que deben cargarse desde tu app en vez de los módulos de WLS. La segunda es para recursos no-clase como archivos de configuración de service loader.

Aquí puedes ver cómo sobrescribir el paquete `commons-io:commons-io` que viene con WLS 12.1.3 (*wlserver/<wbr>modules/<wbr>features/<wbr>weblogic.server.merged.jar*),
y un provider de JAX-RS (WLS 12.2) con los de la app:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-application
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-application"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-application http://xmlns.oracle.com/weblogic/weblogic-application/1.8/weblogic-application.xsd">

    <prefer-application-packages>
        <package-name>org.apache.commons.io.*</package-name>
    </prefer-application-packages>
    <prefer-application-resources>
        <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
    </prefer-application-resources>

</weblogic-application>
```

El lugar correcto para este descriptor es `EAR/META-INF/weblogic-application.xml`. Por defecto, si lo pones en `src/main/application/META-INF/weblogic-application.xml`,
`maven-ear-plugin` lo empaquetará ahí. Si no, la propiedad `earSourceDirectory` del plugin define dónde poner el directorio `META-INF`.

## Descriptor WAR

La ubicación del schema para `weblogic.xml` también es [específica de la versión de WLS](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html).
Desde WLS 12.1.3, hay un desfase de versión respecto al descriptor EAR.
Aunque el schema es distinto, la configuración es similar:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-application-packages>
            <package-name>org.apache.commons.io.*</package-name>
        </prefer-application-packages>
        <prefer-application-resources>
            <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
        </prefer-application-resources>
    </container-descriptor>
</weblogic-web-app>
```

Este descriptor debe ir en `WAR/WEB-INF/weblogic.xml`. Con `maven-war-plugin`, se toma por defecto de `src/main/webapp/WEB-INF/weblogic.xml`.

Una configuración adicional posible con WAR: si tienes versiones de clase en conflicto entre tus clases y dependencias,
puedes forzar que el classloader prefiera tus clases sobre las de dependencias o WLS:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-web-inf-classes>true</prefer-web-inf-classes>
    </container-descriptor>
</weblogic-web-app>
```

No es válido combinar esta opción con `prefer-application-packages`/`prefer-application-resources`.

## Resolución de problemas

Quizá te preguntes si las clases/recursos correctos se cargan en runtime.
A menudo, una señal clara de conflicto es la excepción `java.lang.NoSuchMethodError`.
Aparece en runtime, indicando que la clase cargada no tiene el método referenciado.
Otros errores menos comunes:
- `java.lang.AbstractMethodError`;
- `java.lang.IllegalAccessError`;
- `java.lang.IncompatibleClassChangeError`;
- `java.lang.NoSuchFieldError`;
- `java.lang.NoSuchMethodError`.

Puedes ver la lista completa en la jerarquía de excepciones que heredan de `java.lang.LinkageError`.

A veces no hay error claro, pero dudas del origen de las clases.
En ese caso puedes averiguarlo rápido, por ejemplo:
- `Thread.currentThread().getContextClassLoader().loadClass("org.apache.commons.io.IOUtils").getProtectionDomain().getCodeSource().getLocation();`
- `Thread.currentThread().getContextClassLoader().getResource("META-INF/services/javax.ws.rs.ext.RuntimeDelegate").getPath());`

### Compatibilidad y conflictos

Normalmente, las librerías de WLS vienen de `/oracle_common/modules`, donde puedes verificar la versión por el nombre del JAR.
Si no tiene sufijo de versión, abre el archivo y busca el manifest o metadatos Maven.

Para ver compatibilidad fuente/binario, existe JAPICC `japi-compliance-checker`, una herramienta popular que puedes instalar con el gestor de paquetes del sistema
y obtener más detalles sobre posibles problemas de linking.

También hay una herramienta específica de WLS llamada CAT (Classloader Analysis Tool).
Como aplicación web, viene con la instalación completa de WLS y, por defecto, se despliega bajo el contexto `/wls-cat`.

<img src="/img/hq/wls-cat-conflicts.png" alt="WLS CAT – conflictos de clases" title="WLS CAT – conflictos de clases">

Selecciona tu app en el árbol de la izquierda y ve a la pestaña 'Analyze Conflicts' para ver paquetes en conflicto
y las soluciones sugeridas. Tras configurar el filtering, la lista debería ser más corta. Refresca y ve a 'Classloader Tree' para ver el filtering.
Los conflictos en clases directas EJB/WAR y dependencias deberían detectarse bien.

<img src="/img/hq/wls-cat-classloaders-hierarchy.png" alt="WLS CAT – FilteringClassLoader" title="WLS CAT – FilteringClassLoader">

Aunque parece haber un filtering class loader separado para despliegues EJB standalone, no encontré una forma limpia de configurarlo. Ni `weblogic-application.xml` ni `weblogic.xml` sirven aquí, ni el descriptor '-ejb' tiene esa propiedad.
Así que sugiero envolver el módulo EJB en un EAR en ese caso.

### Soporte Java 9

Por último, en versiones antiguas de WLS puedes ver este error:

> java.lang.UnsupportedClassVersionError: module-info has been compiled by a more recent version of the Java Runtime (class file version 53.0), this version of the Java Runtime only recognizes class file versions up to 52.0

Algunas librerías han añadido soporte para módulos Java 9. Aunque la librería puede ejecutarse en Java 8, viene acompañada de un `module-info`, normalmente en la raíz o en `META-INF/versions`.
En WLS, esto puede causar errores en runtime ya que el archivo está compilado para Java 9:
- causado por el escaneo CDI configurable por `beans.xml`;
- impide el escaneo de CAT.

La forma más sencilla es eliminarlo de la librería, por ejemplo usando el plugin `truezip-maven-plugin` en la fase adecuada.
Aquí tienes una configuración que elimina archivos incompatibles de *log4j* en un WAR para WLS Java 8:

```
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>truezip-maven-plugin</artifactId>
        <version>1.2</version>
        <executions>
          <execution>
            <id>remove-log4j2-java9-meta</id>
            <goals>
              <goal>remove</goal>
            </goals>
            <phase>package</phase>
            <configuration>
              <filesets>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-api-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-core-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
              </filesets>
            </configuration>
          </execution>
        </executions>
      </plugin>
```

Si CAT no muestra la ubicación del module-info incompatible en el stacktrace, haz grep en todos los jars del directorio explotado.
Aunque los jars son binarios, deberías encontrar coincidencias; si no, usa la herramienta estándar de Java: `jar tf <JAR> | grep module-info`.
