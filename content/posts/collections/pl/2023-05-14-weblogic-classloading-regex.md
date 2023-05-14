---
title: Filtrowanie preferowanych pakietów i zasobów na serwerze WebLogic przy pomocy REGEX
url: weblogic-filtrowanie-bibliotek-regex
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

<img src="/img/hq/wls-prefer-application-packages.png" title='Wycinek z zawartość deskryptora odpowiedniego dla serwera WebLogic rozdzielająca pakiety: EL=aplikacja, MOXy=WLS (kompatybilność z metro-jax-ws)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

Serwer aplikacyjny Javy EE WebLogic oferuje możliwość nadpisania bibliotek dostarczanych standardowo przez kontener.
[Funkcjonalność ta](/pl/posty/weblogic-konflikty-bibliotek) opera się o deskryptor `weblogic.xml` umieszczany w folderze `WEB-INF` artefaktu WAR lub deskryptor `weblogic-application.xml`
umieszczany w katalogu `META-INF` archiwum EAR.

W dokumentacji znajdziesz przykłady użycia elementów `prefer-application-packages` i `prefer-application-resources` odpowiednio dla ładowania klas i zasobów.
Przykładowe filtry czasami kończą się (a czasami nie) sufiksem `.*`, przypominając formatem REGEX, bądź GLOB.
Dokumentacja jednak nie wyjaśnia szczegółów tego formatu, które są znaczące, gdy chcemy zaaplikować złożone filtrowanie.

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

Czy powyższa konfiguracja preferuje klasy z pakietów `com.sample`, `com.sample.example`, `com.sample.example.subexample` czy jedną z takich kombinacji?
W jaki sposób skonfigurować dopasowanie dla wszystkich pakietów z `com.sample.*` oprócz `com.sample.example`?
Czy możemy przefiltrować klasy z dokładnością do pełnej nazwy, czy funkcjonalność dotyczy jedynie pakietów (wnioskując od nazwy elementu)?

## WebLogic FilteringClassLoader

Odpowiedź na wszystkie pytania znajdziesz, szukając klasy `FilteringClassLoader` wśród zależności dostarczanych przez WebLogica.
Nazwa ta jest bowiem widoczna przy użyciu narzędzia Classloader Analysis Tool.
Natrafisz na nią już w bibliotece klienckiej obsługi protokołu T3 `${WL_HOME}/server/lib/wlthint3client.jar`, dokładniej w pakiecie `weblogic.utils.classloaders`.

Artefaktu niestety nie znajdziesz w repozytorium mavenowym ze względów licencyjnych. Alternatywą weryfikacji biblioteki oprócz instalacji
serwera we własnym zakresie jest jej wypakowanie z kontenera oficjalnego obrazu dockerowego:
```bash
#!/bin/bash
# Login, review and accept license at https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

Przekładając kod bajtowy klasy `weblogic.utils.classloaders.FilteringClassLoader` na poszczególne kroki, algorytm filtrowania zdaje się wyglądać następująco:
1. Wczytaj wyrażenia z deskryptora i usuń końcowy znak `*` ze wzorca;
2. Dodaj `{0,1}` jeśli wzorzec kończy się na `.`;
3. Poprzedź wzorzec znakiem `^`;
4. Utwórz `java.util.regex.Pattern` i wywołaj `matcher(String)` dla pełnej nazwy klasy/zasobu wyszukując wzorca metodą `find()`.
5. Jeśli nie znaleziono dopasowania, to oddeleguj ładowanie `loadClass/getResourceInternal/getResource/getResources` do classloadera-rodzica, w przeciwnym wypadku zwróć klasę/zasób dostarczoną przez aplikację.  

Z powyższego wynika, że elementy `prefer-application-packages` i `prefer-application-resources` pozwalają na dokładne filtrowanie pakietów i zasobów, jak również poszczególnych klas za pomocą REGEXów.
Warto tu zwrócić uwagę na jego automatyczną modyfikację względem początku i końcowych znaków `*` i `.`.

Do wzorca nie jest dodawany znak końca linii, co w połączeniu z wykorzystaniem metody `find()` zwiększa liczbę filtrowanych pakietów dzięki częściowemu (w alternatywie do funkcji `matches()`) dopasowaniu.
Dodatkowo separator pakietów działa tutaj jako dopasowanie dowolnego znaku co na pierwszy rzut oka może nie być jednoznaczne i bardzo rzadko prowadzić do zbyt szerokiego filtrowania.

Ostatecznie mechanizm pozwala na zdefiniowanie wyrażenia regularnego, które pominie podpakiet, który chcemy pozostawić do załadowania ze zbioru bibliotek dostarczanych przez WLS (np. `^com.sample(?!\.example$)`).
Z drugiej jednak strony pamiętaj o stosowaniu prostych wyrażeń. Nadmierny *backtracking*, czyli cofanie się w celu sprawdzenia wielu możliwych kombinacji dopasowania, może prowadzić do wydłużenia czasu inicjalizacji aplikacji.