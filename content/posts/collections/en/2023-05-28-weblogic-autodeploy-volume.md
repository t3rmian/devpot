---
title: WebLogic autodeploy with Docker Compose
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

Docker Compose is a handy tool that allows you to quickly spin up a development environment consisting of many
containers. In the context of docker images, the typical strategy is to build a new image with a new
version of the application and deploy it to an external environment.
For the needs of the development environment, you can accelerate it by reusing the same container to deploy a new iteration of the application.

<img src="/img/hq/wls-autodeploy-project-tree.png" title='WebLogic startup logs that determine auto-deploy availability based on the non-production mode' alt='WebLogic startup logs that determine auto-deploy availability based on the non-production mode – domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

In the case of WebLogic, the server offers an automatic deployment feature. All you have to do is place the
artifact or an exploded archive in the `autodeploy` directory. With
the help of Docker volumes, you can binding application artifacts to the place of automatic deployment.

When building, artifacts are usually generated in the `build` (Gradle) or `target` (Maven) directory. However, directly linking this path is not the best idea
for several reasons:
1. It contains non-deployable subdirectories.
2. A missing artifact will turn into an empty subdirectory.
3. With each `mvn clean`, the volume bind may appear to be lost until the next restart [(filesystem-specific)](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094).

Therefore, a reliable configuration not requiring manual intervention is to bind the volume to the parent directory.

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

In the sample tree above, to bind the `project` folder to the `/project` directory inside the container, use the following `docker-compose.yml`:

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

You can implement automatic artifact deployment using a soft link. Take a look at the `Dockerfile` below.
It is auto-build by the `docker-compose.yml`. The exploded archive generated by the
`maven-war-plugin`/`maven-ear-plugin` during the `package` phase can also be interchanged with a full artifact.

```Dockerfile
# Requires license acceptation at https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

The modification of the `classes` subfolder is monitored on an ongoing basis and causes the class loader to reload.
The [documentation](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)
also describes a complete redeployment through updating the `REDEPLOY` file (under the WEB-INF/META-INF of the
exploded WAR/EAR artifact). Automate it with the `maven-antrun-plugin` placed as the last one during the `package`.

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

In the example, I used the `debugFlag` and `DEBUG_PORT` environment variables. These are handled by the
`/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh` script. In short, this configures the debugger mode on all network interfaces (JDK 9+).
Now you can debug
and take advantage of the JPDA hot swap facilitated by your favorite IDE (IntelliJ > Edit Configuration > Remote JVM Debug).

> The `domain.properties` file is required for a clean image without custom initialization scripts. It should contain the admin username and password in the following format:
> ```properties
username=myadminusername
password=myadminpassword12#

> If you want to wait for the JVM debugger to attach, configure the `JAVA_OPTIONS` environment variable directly instead of the `debugFlag`.

> Be careful with custom port mapping. It may require [`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171) to establish a `t3` connection.