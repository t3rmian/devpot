---
title: WebLogic i autodeploy z Docker Compose
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

Docker Compose to bardzo przyjazne narzędzie, które pozwala na stosunkowo szybką inicjalizację środowiska deweloperskiego
złożonego z wielu kontenerów. W kontekście obrazów dockerowych najprostszą strategią jest budowanie nowego obrazu wraz 
z nową wersją aplikacji i wdrożenie go na zewnętrznym środowisku. Na potrzeby środowiska deweloperskiego proces ten często możemy przyspieszyć,
używając tego samego kontenera deployując jedynie nową iterację aplikacji.

<img src="/img/hq/wls-autodeploy-project-tree.png" title='Logi startowe WebLogica determinujące autodeploy na WebLogicu w trybie nieprodukcyjnym' alt='Logi startowe WebLogica determinujące autodeploy na WebLogicu w trybie nieprodukcyjnym – domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

W przypadku WebLogica, serwer oferuje funkcjonalność automatycznego deployu. Wystarczy, że w katalogu `autodeploy` umieścimy
spakowany artefakt z aplikacją, bądź rozpakowane archiwum z aktualnym plikiem `REDEPLOY`.
Za pomocą woluminów dockerowych artefakty projektowe podepniesz w miejsce automatycznego wdrażania.

Przy budowaniu artefakty zazwyczaj generowane są w folderze `build` (Gradle) bądź `target` (Maven).
Jednakże bezpośrednie podpięcie tego katalogu nie jest najlepszym pomysłem. 
1. Znajdują się w nim podkatalogi niepodlegające wdrożeniu.
2. O ile możemy zamontować plik, to w przypadku jego braku w kontenerze zostanie utworzony nieoczekiwany folder.
3. Przy każdorazowym `mvn clean`
połączenie woluminu między hostem a kontenerem może być zrywane do czasu restartu kontenera [(w zależności od systemu plików)](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094).

Toteż niezawodną i konfiguracją niewymagającą ręcznej ingerencji jest powiązanie woluminu z katalogiem wyżej.

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

W przykładowym drzewie powyżej, folder projektowy `project` mapujemy (`docker-compose.yml`) na katalog `/project` wewnątrz kontenera:

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

Automatyczne wdrożenie artefaktu możesz zaimplementować za pomocą dowiązania statycznego.
Rzuć okiem na poniższy `Dockerfile`, z którego automatycznie zbudowany zostanie obraz potrzebny do Docker Compose.
Rozpakowane archiwum generowane standardowo przez wtyczkę `maven-war-plugin`/`maven-ear-plugin` w fazie `package` możesz również podmienić spakowanym artefaktem,
dodając rozszerzenie po obu stronach.

```Dockerfile
# Requires license acceptation at https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

O ile modyfikacja plików w podfolderze `classes` jest na bieżąco monitorowana i wywołuje przeładowanie class loadera, to [dokumentacja](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)
umożliwia również pełny *redeploy* poprzez aktualizacje pliku `REDEPLOY` (w WEB-INF/META-INF artefaktu WAR/EAR).
Taką operację wykona za Ciebie wtyczka `maven-antrun-plugin` umieszczona w końcowej fazie `package`.


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

W przykładzie wykorzystałem zmienne środowiskowe `debugFlag` i `DEBUG_PORT`, których obsługę znajdziesz w skrypcie
`/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh`. W skrócie konfigurują one możliwość podpięcie debuggera
w sposób kompatybilny dla JDK 11 (na wszystkich interfejsach sieciowych kontenera).
Teraz możesz skorzystać z opcji debugowania i hot swapu (JPDA) udostępnianych przez ulubione IDE (IntelliJ > Edit Configuration > Remote JVM Debug).


> Plik `domain.properties` jest potrzebny dla czystego obrazu bez własnych skryptów inicjalizujących. Powinien zawierać nazwę użytkownika (administratora) i hasło w formacie:
> ```properties
username=myadminusername
password=myadminpassword12#

> Jeśli chcesz zatrzymać JVM w oczekiwaniu na podpięcie debuggera, skonfiguruj bezpośrednio zmienną środowiskową `JAVA_OPTIONS` zamiast `debugFlag`.

> Uważaj na mapowanie portów. Niestandardowe mapowanie może wymagać [`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171) do nawiązania połączenia `t3`.
