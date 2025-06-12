---
title: Autodeploy de WebLogic con Docker Compose
url: weblogic-autodeploy-docker-compose
id: 111
category:
  - jee: JEE
tags:
  - weblogic
  - classloading
  - docker
author: Damian Terlecki
date: 2023-05-29T20:00:00
---

Docker Compose es una herramienta muy útil que te permite levantar rápidamente un entorno de desarrollo con muchos contenedores.
En el contexto de imágenes docker, la estrategia típica es construir una nueva imagen con una nueva versión de la aplicación y desplegarla en un entorno externo.
Para el entorno de desarrollo, puedes acelerar esto reutilizando el mismo contenedor para desplegar una nueva iteración de la aplicación.

<img src="/img/hq/wls-autodeploy-project-tree.png" title='Logs de inicio de WebLogic que determinan la disponibilidad de autodeploy según el modo no producción' alt='Logs de inicio de WebLogic que determinan la disponibilidad de autodeploy según el modo no producción – domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

En el caso de WebLogic, el servidor ofrece una función de despliegue automático. Solo tienes que colocar el artefacto o el archivo expandido en el directorio `autodeploy`. Con la ayuda de volúmenes Docker, puedes enlazar los artefactos de la aplicación al lugar de despliegue automático.

Al compilar, los artefactos suelen generarse en el directorio `build` (Gradle) o `target` (Maven). Sin embargo, enlazar directamente esta ruta no es la mejor idea por varias razones:
1. Contiene subdirectorios no desplegables.
2. Un artefacto faltante se convierte en un subdirectorio vacío.
3. Con cada `mvn clean`, el bind del volumen puede parecer perdido hasta el siguiente reinicio [(específico del sistema de archivos)](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094).

Por eso, una configuración fiable que no requiera intervención manual es enlazar el volumen al directorio padre.

```bash
project/
├─ src/
│  ├─ main/
│  │  ├─ java/
│  │  │  ├─ .../
│  │  ├─ webapp/
│  │  │  ├─ WEB-INF/
│  │  │  │  ├─ web.xml
├─ target/
│  ├─ classes
│  ├─ wlsdemo
│  ├─ wlsdemo.war
├─ src/
│  ├─ index.css
│  ├─ index.js
├─ docker-compose.yml
├─ domain.properties
├─ pom.xml
```

En el árbol de ejemplo, para enlazar la carpeta `project` al directorio `/project` dentro del contenedor, usa el siguiente `docker-compose.yml`:

```yaml
version: '3'
services:
  weblogic:
    build: ./
    environment:
      - "debugFlag=true"
      - "DEBUG_PORT=*:8453"
    ports:
      - "7001:7001" #admin_listen_port
      - "9002:9002" #secure administration_port
      - "8453:8453" #custom debug port
    volumes:
      - ./:/project
      - ./:/u01/oracle/properties
```

Puedes implementar el despliegue automático de artefactos usando un enlace simbólico. Mira el siguiente `Dockerfile`.
Se construye automáticamente con el `docker-compose.yml`. El archivo expandido generado por el
`maven-war-plugin`/`maven-ear-plugin` durante la fase `package` también puede intercambiarse por un artefacto completo.

```Dockerfile
# Requiere aceptar la licencia en https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

La modificación de la subcarpeta `classes` se monitoriza en tiempo real y provoca que el class loader recargue.
La [documentación](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)
también describe un redeploy completo actualizando el archivo `REDEPLOY` (bajo WEB-INF/META-INF del WAR/EAR expandido). Automatízalo con el `maven-antrun-plugin` como último paso en el `package`.

```xml
    <build>
        <finalName>${artifactId}</finalName>
        <plugins>
            <!--...-->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-antrun-plugin</artifactId>
                <version>3.0.0</version>
                <executions>
                    <execution>
                        <id>touch-redeploy-file</id>
                        <phase>package</phase>
                        <goals>
                            <goal>run</goal>
                        </goals>
                        <configuration>
                            <target>
                                <touch file="${project.build.directory}/${project.artifactId}/WEB-INF/REDEPLOY"
                                       verbose="true" />
                            </target>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
</build>
```

En el ejemplo, usé las variables de entorno `debugFlag` y `DEBUG_PORT`. Estas son gestionadas por el script
`/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh`. En resumen, esto configura el modo debugger en todas las interfaces de red (JDK 9+).
Ahora puedes depurar y aprovechar el hot swap de JPDA desde tu IDE favorito (IntelliJ > Edit Configuration > Remote JVM Debug).

> El archivo `domain.properties` es necesario para una imagen limpia sin scripts de inicialización personalizados. Debe contener el usuario y contraseña de admin en el siguiente formato:
> ```properties
username=myadminusername
password=myadminpassword12#

> Si quieres esperar a que el debugger JVM se conecte, configura la variable de entorno `JAVA_OPTIONS` directamente en vez de `debugFlag`.

> Ten cuidado con el mapeo de puertos personalizado. Puede requerir [`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171) para establecer una conexión `t3`.
