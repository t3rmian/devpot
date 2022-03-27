---
title: Vert.x obraz natywny GraalVM 19.3.0+
url: vertx-obraz-natywny-graalvm
id: 39
category:
- java: Java
tags:
  - jvm
  - oracle
  - vertx
author: Damian Terlecki
date: 2020-09-20T20:00:00
---

Vert.x to całkiem przyjemny framework do budowania reaktywnych aplikacji sieciowych nie tylko na platformie Java, ale również dla takich języków jak JavaScript czy Ruby. Charakteryzuje się zaskakująco małym rozmiarem – pomijając serwer Netty ~ 3 MB – sam rdzeń, jak można znaleźć na głównej stronie, zajmuje jedynie 650 kB. Dzięki stosunkowo niewielkiej liczbie obiektów potrzebnych do startu aplikacji Vert.x świetnie nadaje się do budowy mikroserwisów.

## Obraz natywny

Jeśli chcemy jeszcze bardziej dopieścić naszą aplikację zbudowaną na bazie Vert.x, możemy stworzyć jej obraz natywny przy użyciu GraalVM (kompilacja AOT – Ahead of Time). Takie podejście pozwoli nam jeszcze bardziej obniżyć ilość czasu potrzebnego na uruchomienie aplikacji, a zarazem zmniejszyć rozmiar wykorzystywanej pamięci. Do tego procesu musimy jednak znać przede wszystkim:
- platformę docelową, na której będzie uruchamiana aplikacja;
- które klasy powinny zostać zainicjalizowane podczas procesu budowania;
- które klasy wykorzystują mechanizm refleksji.

<img src="/img/hq/graalvm-native-image.png" alt="Zrzut ekranu z logami z budowania obrazu natywnego" title="Budowanie obrazu natywnego">

SubstrateVM (wewnętrzna nazwa projektu narzędzia *native-image*), wspiera użytkownika w przygotowaniu poprawnego obrazu natywnego. Część problemów rozwiązywana jest przez samo narzędzie za pomocą analizy statycznej. Pozostałe elementy użytkownik musi skonfigurować ręcznie za pomocą parametrów podanych do narzędzia bądź plików konfiguracyjnych umieszczanych w `src/main/resources/META-INF/native-image/<nazwa_grupy_paczki>/<nazwa_artefaktu>/*`.

## Proces

Generalnie proces przygotowania obrazu natywnego wygląda następująco:
1. Tworzymy aplikację w postaci tzw. fat jara (ze wszystkimi potrzebnymi zależnościami).
2. Pobieramy GraalVM:
  - [z wydań stabilnych](https://github.com/graalvm/graalvm-ce-builds/releases);
  - [z wydań deweloperskich](https://github.com/graalvm/graalvm-ce-dev-builds/releases);
  - [jako obraz dockerowy](https://hub.docker.com/r/oracle/graalvm-ce) – polecam, szczególnie na Windowsie, gdyż narzędzie *native-image* wymaga tam dodatkowo instalacji Microsoft Visual C++.
3. Instalujemy narzędzie *native-image*: `gu install native-image`.
4. Budujemy obraz z naszej paczki z punktu 1.
5. Jeśli wszystko pójdzie bez problemu, to powinniśmy otrzymać natywny plik binarny do uruchomienia.

Kroki 2-5 (ale również i krok 1), możemy wrzucić sobie do dockera:

```docker
FROM oracle/graalvm-ce:20.2.0-java11 AS buildEnv
RUN gu install native-image

WORKDIR /workdir
COPY <fat_jar_zbudowany_na_hoście>.jar .
RUN native-image -cp <fat_jar_zbudowany_na_hoście>.jar \
    --no-server \
    --no-fallback \
    --enable-all-security-services \
    --allow-incomplete-classpath \
    -H:Name="<nazwa_wynikowego_pliku>" \
    <twoja.klasa.main>

# Tutaj możemy skorzystać z budowania multi-stage i wystartować z odchudzonego obrazu.
# W zależności jak bardzo odchudzony obraz wybierzemy, możemy potrzebować kilku nieobecnych bibliotek.
# Wymagane biblioteki możesz znaleźć za pomocą ldd.
# RUN ldd <nazwa_wynikowego_pliku>
# FROM gcr.io/distroless/base
# COPY --from=buildEnv /usr/lib64/libz.so.1 /lib/x86_64-linux-gnu/libz.so.1
# COPY --from=buildEnv "/usr/lib64/libstdc++.so.6" "/lib/x86_64-linux-gnu/libstdc++.so.6"
# COPY --from=buildEnv "/usr/lib64/libgcc_s.so.1" "/lib/x86_64-linux-gnu/libgcc_s.so.1"

EXPOSE 8080
CMD ["./<nazwa_wynikowego_pliku>"]
```

## Dodatkowe materiały

Do zbudowania paczki z wszystkimi niezbędnymi zależnościami polecam użycie pluginów.

#### Gradle
Jeśli do budowania projektu preferujesz użycie Gradle, to [vertx-gradle-plugin](https://github.com/jponge/vertx-gradle-plugin) powinien ułatwić Ci budowanie `gradle shadowJar`, uruchamianie `gradle vertxRun` i debugowanie `gradle vertxDebug` aplikacji:

```groovy
plugins {
    id "io.vertx.vertx-plugin" version "1.1.1"
}

vertx {
    mainVerticle = '<twoja.klasa.main>'
}
```

Opcjonalnie, możemy budować obraz natywny z poziomu Gradle przy pomocy pluginów [graalvm-native-image-plugin](https://github.com/mike-neck/graalvm-native-image-plugin) bądź [gradle-graal](https://github.com/palantir/gradle-graal).

#### Maven
Mavenowców zainteresować może plugin [vertx-maven-plugin](https://reactiverse.io/vertx-maven-plugin/).

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

Konfigurację budowania obrazu możemy również przenieść do specjalnego pluginu [native-image-maven-plugin](https://www.graalvm.org/reference-manual/native-image/NativeImageMavenPlugin/).


##### Konfiguracja

Pełną konfigurację potrzebną do przygotowania obrazu natywnego (GraalVM 19.2.1) aplikacji Vert.x (3.8.2) znajdziesz w repozytorium [graal-native-image-howto](https://github.com/vertx-howtos/graal-native-image-howto/tree/4a75d19be41bac9a8021710bda476100939f33c3/steps).

> **Uwaga:** W przypadku wersji GraalVM 19.3.0+ i wyżej, do [parametrów uruchomieniowych native-image](https://github.com/vertx-howtos/graal-native-image-howto/blob/4a75d19be41bac9a8021710bda476100939f33c3/steps/step-9/src/main/resources/META-INF/native-image/com.example/myapp/native-image.properties) należy dodać `io.netty.resolver.dns.DnsServerAddressStreamProviders$DefaultProviderHolder` [(źródło)](https://github.com/oracle/graal/issues/1902).