---
title: Paquetes preferidos en WebLogic usando REGEX
url: weblogic-preferred-libraries-regex
id: 110
category:
  - jee: JEE
tags:
  - weblogic
  - classloading
  - docker
author: Damian Terlecki
date: 2023-05-14T20:00:00
---

<img src="/img/hq/wls-prefer-application-packages.png" title='Extracto del descriptor de WebLogic que separa paquetes: EL=aplicación, MOXy=WLS (compatible con metro-jax-ws)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

El servidor Java EE – WebLogic – ofrece una función para sobrescribir las librerías proporcionadas por el contenedor.
[Esa configuración](/posts/weblogic-library-conflicts) es posible mediante el descriptor `weblogic.xml` en la carpeta `WEB-INF` de un WAR o el descriptor `weblogic-application.xml` en el directorio `META-INF` de un EAR.

Encontrarás fácilmente ejemplos de uso de los elementos `prefer-application-packages` y `prefer-application-resources` para cargar clases y recursos, respectivamente.
A veces los filtros de ejemplo terminan (o no) con el sufijo `.*`, pareciendo REGEX o GLOB.
Sin embargo, la documentación no explica los detalles de este formato, que son importantes si quieres aplicar filtros complejos.

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

¿La configuración anterior prefiere clases de los paquetes `com.sample`, `com.sample.example`, `com.sample.example.subexample` o alguna combinación?
¿Cómo configurar un filtro para todos los paquetes de `com.sample.*` excepto `com.sample.example`?
¿Puedes filtrar hasta el nombre completo de la clase, o solo aplica a paquetes (por el nombre del elemento)?

## WebLogic FilteringClassLoader

Todas las preguntas llevan al código. `FilteringClassLoader` es la clase a buscar entre las dependencias de WebLogic.
Este nombre aparece en el reporte de otra herramienta útil: Classloader Analysis Tool.
Encontrarás esta clase al cargar la librería cliente del protocolo T3 `${WL_HOME}/server/lib/wlthint3client.jar`.
Más precisamente, está en el paquete `weblogic.utils.classloaders`.

Por razones de licencia, la librería no está en Maven Central.
Para verificar, puedes extraerla de un contenedor de la imagen oficial de docker como alternativa a la instalación de WLS:
```bash
#!/bin/bash
# Inicia sesión, revisa y acepta la licencia en https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

Ahora, el bytecode de `weblogic.utils.classloaders.FilteringClassLoader` parece traducirse en el siguiente algoritmo:
1. Cargar el patrón y eliminar el carácter final `*`;
2. Añadir el sufijo `{0,1}` si el patrón termina en `.`;
3. Anteponer el patrón con `^`;
4. Crear un `java.util.regex.Pattern` y llamar a `matcher(String)` para el nombre completo de la clase/recurso usando el método `find()`.
5. Si no hay coincidencia, delegar la carga de `loadClass/getResourceInternal/getResource/getResources` al classloader padre; si hay coincidencia, devolver la clase/recurso de la aplicación.

Esto muestra que los elementos `prefer-application-packages` y `prefer-application-resources` permiten filtrar paquetes y recursos, así como clases individuales usando REGEX.
Ten en cuenta que hay algunos añadidos, por ejemplo, respecto a los caracteres inicial y final `*` y `.`.

El carácter de fin de línea no se añade al patrón. Combinado con el uso de `find()`, esto aumenta el número de paquetes filtrados por coincidencia parcial (en vez de `matches()`).
Además, el separador de paquetes funciona aquí como un comodín, lo que puede ser ambiguo y rara vez llevar a un filtrado más amplio de lo esperado.

Finalmente, el mecanismo permite definir una expresión regular que omita el subpaquete. Una expresión como `^com.sample(?!\.example$)` hará que se use el set de librerías de WLS si no hay otra coincidencia.
Eso sí, intenta usar expresiones simples. Un backtracking excesivo puede aumentar el tiempo de inicialización de la aplicación.
