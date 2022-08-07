---
title: WebLogic i konflikty klas/bibliotek
url: weblogic-konflikty-bibliotek
id: 92
category:
  - jee: JEE
tags:
  - classloading
  - weblogic
author: Damian Terlecki
date: 2022-08-07T20:00:00
---

Jeśli szukasz sposobu, aby WebLogic ładował określone wersje bibliotek dostarczanych w paczce z Twoją aplikacją,
oto kilka wskazówek, które pomogą Ci podłapać temat:
1. WebLogic jako serwer aplikacyjny zawiera wiele bibliotek, których możesz również używać w swojej aplikacji.
2. WebLogic przestrzega standardowego procesu delegacji w górę podczas ładowania klas. Żądana klasa jest najpierw wyszukiwana (preferowana) przez *class loader* systemowy, a dopiero później przez *class loader* aplikacyjny.
3. "Filtering Class Loader" to funkcjonalność WebLogica, która pozwala wdrażającemu wpływać na ten proces i odwracać niektóre jego części. Dzięki temu można osiągnąć ładowanie klas podobne jak w przypadku serwera Tomcat.

Filtrowania klas można użyć podczas wdrażania aplikacji WAR lub aplikacji EAR. W zależności od typu archiwum używane są dwa różne deskryptory:
- weblogic-application.xml (EAR);
- weblogic.xml (WAR).

## Deskryptor EAR

W przypadku deskryptora EAR pasującą definicję schematu XML znajdziesz na podstawie [listy wersji schematu](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-application/index.html) na stronie Oracle.
Wystarczy, że mapowanie `xsi:schemaLocation` zaktualizujesz wersją pasującą do Twojego WLS. Przejdźmy teraz do deskryptora,
ważne dla nas ustawienia to `prefer-application-packages` i `prefer-application-resources`.

Pierwsze z nich służy do konfigurowania klas, które powinny być ładowane z aplikacji zamiast z modułów WLS. Druga właściwość
może być użyta do innych zasobów, takich jak pliki konfiguracyjne.

Poniżej możesz zobaczyć, jak nadpisać pakiet `commons-io:commons-io` dołączony do WLS 12.1.3 (*wlserver/<wbr>modules/<wbr>features/<wbr>weblogic.server.merged.jar*),
a także dostawcę implementacji JAX-RS (WLS 12.2):

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

Prawidłowa lokalizacja tego deskryptora to `EAR/META-INF/weblogic-application.xml`. Domyślnie, jeśli umieścisz go w `src/main/application/META-INF/weblogic-application.xml`,
wtyczka `maven-ear-plugin` dołączy go do właściwego katalogu. W przeciwnym razie właściwość konfiguracyjna `earSourceDirectory` wtyczki definiuje miejsce, w którym należy umieścić katalog `META-INF`.

## Deskryptor WAR

Lokalizacja schematu opisującego plik `weblogic.xml` jest również [specyficzna dla wersji WLS](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html).
Zauważ, że od wersji WLS 12.1.3 istnieje niewielkie przesunięcie numeru wersji w porównaniu z deskryptorem EAR.
Chociaż schemat jest inny, konfiguracja jest podobna do powyższej:

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

Tym razem deskryptor powinien znaleźć się w `WAR/WEB-INF/weblogic.xml`. W przypadku `maven-war-plugin` zostanie on
domyślnie przeniesiony tam z pliku `src/main/webapp/WEB-INF/weblogic.xml`.

Jedna dodatkowa konfiguracja jest możliwa przy wdrożeniu WAR. Załóżmy, że masz sprzeczne wersje klas między własnymi pakietami a zależnościami.
W takim przypadku możesz zmusić *class loadera*, aby preferował twoje klasy nad klasami z bibliotek/serwera:

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

Połączenie tej opcji z `prefer-application-packages`/`prefer-application-resources` jest niedozwolone.

## Rozwiązywanie problemów

Możesz się zastanawiać, czy właściwe klasy/zasoby są prawidłowo ładowane w czasie wykonywania.
Często wskaźnikiem konfliktu jest wyjątek `java.lang.NoSuchMethodError`.
Pojawia się w czasie wykonywania, sygnalizując, że w załadowanej klasie brakuje sygnatury metody, do której odwołuje się kod.
Inne mniej popularne błędy to:
- `java.lang.AbstractMethodError`;
- `java.lang.IllegalAccessError`;
- `java.lang.IncompatibleClassChangeError`;
- `java.lang.NoSuchFieldError`;
- `java.lang.NoSuchMethodError`.

Pełną ich listę znajdziesz w drzewie wyjątków dziedziczących po `java.lang.LinkageError`.

Czasami nie ma wyraźnego błędu, ale możesz nie mieć pewności co do źródeł klas i ich faktycznej logiki.
W takim przypadku możesz szybko znaleźć źródło, np.:
- `Thread.currentThread().getContextClassLoader().loadClass("org.apache.commons.io.IOUtils").getProtectionDomain().getCodeSource().getLocation();`
- `Thread.currentThread().getContextClassLoader().getResource("META-INF/services/javax.ws.rs.ext.RuntimeDelegate").getPath());` 

### Kompatybilność i konflikty

Z reguły biblioteki WLS znajdują się w katalogu `/oracle_common/modules`. Na podstawie nazwy szybko zweryfikujesz wersję biblioteki.
Jeśli plik nie ma sufiksu wersji, możesz otworzyć archiwum i poszukać manifestu META-INF lub metadanych Mavena.

Aby sprawdzić kompatybilność źródłową/binarną polecam JAPICC `japi-compliance-checker` – popularne narzędzie,
które zainstalujesz za pomocą menedżera pakietów systemowych. Dzięki niemu uzyskać więcej informacji na temat możliwych problemów wynikających z aktualizacji zależności
bez rekompilacji.

Innym narzędziem, specyficznym dla WLS jest CAT (Classloader Analysis Tool).
Jako aplikacja webowa jest dołączona do standardowej instalacji WLS i domyślnie dostępna pod ścieżką `/wls-cat`.

<img src="/img/hq/wls-cat-conflicts.png" alt="WLS CAT – konflikt klas" title="WLS CAT – konflikt klas">

Po przejściu do CAT wybierz swoją aplikację w drzewie po lewej stronie, a następnie przejdź do zakładki "Analyze Conflicts", aby zweryfikować potencjalne pakiety,
które są w konflikcie, a także sugerowane rozwiązania. Zarówno konflikty klas EJB/WAR jak i ich zależności powinny być prawidłowo wyświetlone.
Po skonfigurowaniu filtrowania lista powinna się zmniejszyć.
Naciśnij "Refresh" i przejdź do "Classloader Tree", aby zweryfikować nowe filtrowanie.

<img src="/img/hq/wls-cat-classloaders-hierarchy.png" alt="WLS CAT – FilteringClassLoader" title="WLS CAT – FilteringClassLoader">

Mimo widoczności FilteringClassLoader dla samodzielnych wdrożeń EJB nie znalazłem
czystego sposobu na jego skonfigurowanie. Ani deskryptory `weblogic-application.xml` ani `weblogic.xml` nie mieszczą się tutaj,
ani deskryptor "-ejb" nie ma takiej właściwości konfiguracyjnej.
Dlatego sugeruję w tym przypadku po prostu opakować moduł EJB w EAR.

### Wsparcie dla Javy 9

Ostatni potencjalny problem może pojawić się na starszych wersjach WLS:

> java.lang.UnsupportedClassVersionError: module-info has been compiled by a more recent version of the Java Runtime (class file version 53.0), this version of the Java Runtime only recognizes class file versions up to 52.0

Niektóre biblioteki dodały obsługę modułowości z Javy 9. Mimo że biblioteka może być uruchomiona w Javie 8,
to towarzyszy jej również plik `module-info`, zwykle albo w katalogu głównym biblioteki, albo w katalogu `META-INF/versions`.
Ponieważ plik jest skompilowany dla Javy 9, w przypadku WLS może to powodować błędy w czasie wykonywania:
- przy domyślnie włączonym skanowaniu CDI konfigurowanym przez deskryptor `beans.xml`;
- podczas skanowania klas przez CAT.

Najprostszym sposobem jest usunięcie pliku z biblioteki, np. wtyczką `truezip-maven-plugin` tuż po zbudowaniu artefaktu.
Spójrz na następującą konfigurację, która usuwa niekompatybilne pliki *log4j* zawarte w WARze działającym na WLS 12.1.3 i Javie 8:

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

Jeśli CAT nie pokazuje lokalizacji *module-info* w stacktrace, po prostu zgrepuj wszystkie pliki JAR w katalogu aplikacji.
Mimo że JARy są plikami binarnymi, zazwyczaj otrzymasz komunikat o znalezieniu dopasowania, jeśli nie, użyj standardowego narzędzia Java `jar`: `jar tf <JAR> | grep module-info`.
