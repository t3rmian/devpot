---
title: PropertiesTransformer del Maven Shade Plugin con ejemplos
url: maven-shade-plugin-properties-transformer
id: 112
category:
  - java: Java
tags:
  - maven
  - maven-shade-plugin
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

Maven Shade Plugin es una extensión que te permite combinar dependencias durante el proceso de build del proyecto.
El objetivo de este plugin es crear un único archivo JAR que contenga todas las dependencias de la aplicación y su código.

Durante este proceso, la fusión de archivos de configuración como `*.properties` puede ser problemática. Por defecto, el último archivo encontrado será el que quede en el artefacto resultante.
El plugin ofrece configuración mediante los llamados transformers para resolver estos problemas e influir en el comportamiento de la fusión de recursos.

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='Maven Shade Plugin reportando solapamiento de recursos' alt='Maven Shade Plugin reportando solapamiento de recursos'>

## Transformador *PropertiesTransformer*

El plugin ofrece varios transformers preinstalados. Los más complejos puedes importarlos de proveedores externos. Desde la versión 3.2.2, los desarrolladores también han incluido una implementación de `org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`.
Su nombre puede sonar prometedor si necesitas cambiar el orden de combinación de properties.
Esto puede ser útil para que la aplicación cargue las properties preferidas (normalmente las sobreescritas).

Si revisas la [*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)
y pruebas la configuración de ejemplo (referenciada abajo), puede que te cueste conseguir el resultado esperado.
La explicación de las propiedades puede parecer superficial, por lo que es mejor ver el comportamiento en ejemplos
([versión 3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java)).

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- configuración requerida -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- configuración opcional -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

Teniendo dos archivos `configuration/application.properties` de los módulos A y B respectivamente:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
el *maven-shade-plugin* con el *PropertiesTransformer* combinando ambas dependencias producirá el siguiente archivo `configuration/application.properties` por defecto:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***

### *ordinalKey* y *defaultOrdinal*

El orden en que se fusionan los archivos se controla con `ordinalKey`, que apunta al nombre de la propiedad cuyo valor es el orden numérico. Si el archivo no contiene esa clave, su orden lo define `defaultOrdinal` (0 si falta).
Definiendo un orden mayor al predeterminado en el archivo del módulo A:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```

en la salida obtendrás la propiedad `prop2` del módulo A, logrando el orden invertido. Además, el transformer eliminará la clave artificial:

```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

La opción `alreadyMergedKey` define el nombre de una propiedad de tipo `boolean` (por ejemplo, un *String* `true`) que indica prioridad del archivo.
Así, el transformer no fusionará otros archivos en este.

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
Para estos casos, obtendrás una copia de las properties del módulo A, de nuevo con la clave sintética eliminada:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

La aparición de esta clave con valor `true` en más de un archivo no está permitida y dará error.

***

### *reverseOrder*

Puedes usar la opción `reverseOrder` para invertir el orden de concatenación de archivos. Sin embargo, esta opción no invierte el orden entre archivos con el mismo valor de orden. Es decir, para `<reverseOrder>true</reverseOrder>` y dos archivos de properties:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
seguirás obteniendo (independientemente del valor de `reverseOrder`) el mismo resultado:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

La inversión solo funciona tras definir el orden con `ordinalKey` y solo entre archivos de diferente orden.

***

## Resumen

El `PropertiesTransformer` permite la fusión básica de archivos de properties. Es importante saber que los archivos se cargan inicialmente usando `java.util.Properties`, lo que significa que los duplicados se sobrescriben con la propiedad más reciente (más abajo en el archivo).

Para determinar el orden de fusión o designar un archivo prioritario entre varios, debes incluir una clave artificial.
Lamentablemente, no es posible invertir el orden entre archivos con valores de orden idénticos o por defecto.

Si necesitas un comportamiento de fusión diferente (por ejemplo, sin claves artificiales), busca paquetes externos con transformers personalizados.
Puedes añadir fácilmente una dependencia así usando la etiqueta `<dependencies></dependencies>` dentro de `<plugin></plugin>`.
Si solo quieres combinar las properties en orden inverso, revisa
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0).
