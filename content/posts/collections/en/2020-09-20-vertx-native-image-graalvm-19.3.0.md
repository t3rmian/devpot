---
title: Vert.x native image with GraalVM 19.3.0+
url: vertx-native-image-graalvm
id: 39
tags:
  - java
  - jvm
  - oracle
author: Damian Terlecki
date: 2020-09-20T20:00:00
---

Vert.x is a really fun framework for building reactive web applications not only on the Java platform but also for languages such as JavaScript and Ruby. It has a surprisingly small size – excluding the ~ 3 MB Netty server – the core itself, as can be found on the main page, is only 650 kB. Thanks to a relatively small number of objects needed to start the application, Vert.x is a valid choice for building microservices.

## Native image

If we want to refine our Vert.x application even more, we can create its native image using GraalVM (through the means of AOT – Ahead of Time compilation). This approach will allow us to further reduce the amount of time needed to start the application, and at the same time reduce the size of the memory used. For this process, however, we must know first of all:
- the target platform on which the application will be run;
- which classes should be initialized during the build process;
- which classes use the reflection mechanism.

<img src="/img/hq/graalvm-native-image.png" alt="Screenshot of logs from native image build process" title="Native image build process">

The SubstrateVM (internal name of the *native-image* tool project) supports the user in preparing the correct native image. Some potential issues are solved by the tool itself through static analysis. The remaining elements must be manually configured by the user using parameters passed to the tool or through configuration files placed in `src/main/resources/META-INF/native-image/<package_group_name>/<artifact_name>/*`.

## Process

In general, the process of preparing a native image is as follows:
1. Create an application in and pack it in the so-called fat jar (with all required dependencies).
2. Download GraalVM:
   - [from stable releases](https://github.com/graalvm/graalvm-ce-builds/releases);
   - [from development releases](https://github.com/graalvm/graalvm-ce-dev-builds/releases);
   - [as a docker image](https://hub.docker.com/r/oracle/graalvm-ce) – this is my recommendation, especially on Windows, because the *native-image* tool requires Microsoft Visual C++ to be installed there.
3. Install the *native-image* utility: `gu install native-image`.
4. Build an image from our package from point 1.
5. If all goes well, we should get a native binary to run.

We can simplify steps 2-5 (and also step 1 if you want) by running them inside a docker. This way we don't have to download and install the GraalVM on the host machine:

```docker
FROM oracle/graalvm-ce:20.2.0-java11 AS buildEnv
RUN gu install native-image

WORKDIR /workdir
COPY <fat_jar_built_on_host>.jar .
RUN native-image -cp <fat_jar_built_on_host>.jar \
    --no-server \
    --no-fallback \
    --enable-all-security-services \
    --allow-incomplete-classpath \
    -H:Name="<native_executable>" \
    <your.main.class>

# Here we can take advantage of the multi-stage build and boot from an optimized docker image.
# Depending on how much slimmed down image we choose, we may need to transfer several missing libraries.
# Generally, you can find the required libraries using ldd.
# RUN ldd <native_executable>
# FROM gcr.io/distroless/base
# COPY --from=buildEnv /usr/lib64/libz.so.1 /lib/x86_64-linux-gnu/libz.so.1
# COPY --from=buildEnv "/usr/lib64/libstdc++.so.6" "/lib/x86_64-linux-gnu/libstdc++.so.6"
# COPY --from=buildEnv "/usr/lib64/libgcc_s.so.1" "/lib/x86_64-linux-gnu/libgcc_s.so.1"

EXPOSE 8080
CMD ["./<native_executable>"]
```

## Additional set-up

I recommend using plugins for your favorite build tool, to prepare a package with all the necessary dependencies.

#### Gradle
If you prefer to use Gradle for building a project then [vertx-gradle-plugin](https://github.com/jponge/vertx-gradle-plugin) should make your life easier. The plugin adds additional tasks like `gradle shadowJar` to build a fat jar, `gradle vertxRun` for running and `gradle vertxDebug` for debugging the application:

```groovy
plugins {
    id "io.vertx.vertx-plugin" version "1.1.1"
}

vertx {
    mainVerticle = '<your.main.class>'
}
```

Optionally, we can build a native image from Gradle using [graalvm-native-image-plugin](https://github.com/mike-neck/graalvm-native-image-plugin) or [gradle-graal](https://github.com/palantir/gradle-graal) plugins.

#### Maven
Maven enthusiasts might be interested in the [vertx-maven-plugin](https://reactiverse.io/vertx-maven-plugin/) plugin.

```xml
<project>
  ...
  <build>
    <plugins>
        ...
        <plugin>
            <groupId>io.reactiverse</groupId>
            <artifactId>vertx-maven-plugin</artifactId>
            <version>1.0.22</version>
            <executions>
                <execution>
                    <id>vmp</id>
                    <goals>
                        <goal>initialize</goal>
                        <goal>package</goal>
                    </goals>
                </execution>
            </executions>
            <configuration>
                <redeploy>true</redeploy>
            </configuration>
        </plugin>
        ...
    </plugins>
  </build>
  ...
</project>
```

We can also move the image build configuration to a dedicated [native-image-maven-plugin](https://www.graalvm.org/reference-manual/native-image/NativeImageMavenPlugin/) plugin.


##### Configuration

The full configuration needed to prepare a native image (GraalVM 19.2.1) of the Vert.x (3.8.2) application can be found in the [graal-native-image-howto](https://github.com/vertx-howtos/graal-native-image-howto/tree/4a75d19be41bac9a8021710bda476100939f33c3/steps) repository.

> **Note:** For GraalVM 19.3.0+ and above, `io.netty.resolver.dns.DnsServerAddressStreamProviders$DefaultProviderHolder` has to be added to the [native-image runtime parameters](https://github.com/vertx-howtos/graal-native-image-howto/blob/4a75d19be41bac9a8021710bda476100939f33c3/steps/step-9/src/main/resources/META-INF/native-image/com.example/myapp/native-image.properties) [(source)](https://github.com/oracle/graal/issues/1902).
