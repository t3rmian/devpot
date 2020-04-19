---
title: Jak (nie) uruchomić NodeJS na Javie
url: nodejs-java
id: 28
tags:
  - java
  - nodejs
author: Damian Terlecki
date: 2020-04-19T20:00:00
---

Zazwyczaj aplikację NodeJS uruchamiamy w kontenerze dockerowym. Co się stanie, jeśli nasz hosting nie obsługuje aplikacji dokerowych? Na pewno umożliwia samodzielną instalację środowiska NodeJS, prawda? Co, jeśli jednak nie mamy również takiej opcji? Serwer może być przykładowo odcięty (zabezpieczony) od internetu, z bardzo ograniczonymi opcjami dostępu do środowiska, które sprowadzają się jedynie do automatycznego wdrożenia aplikacji napisanej w Javie.

Rzućmy okiem na możliwe opcje, biorąc pod uwagę jedynie rozwiązania oparte o JVM. Temat dotyczy również wszystkich innych przypadków, w których chcemy po prostu uruchomić jakieś skrypty NodeJSowe bezpośrednio z Javy. Zawsze warto jednak sobie zadać pytanie, czy warto?

## Przenośny NodeJS

Podobnie jak JVM jest środowiskiem uruchomieniowym dla kodu bajtowego Java, NodeJS jest środowiskiem wykonawczym dla kodu JavaScript, który jest wykonywany poza przeglądarką internetową. Pierwszą rzeczą, którą będziemy potrzebować, to przenośna wersja NodeJS dla systemu docelowego. Jeśli masz już zainstalowane środowisko i chcesz jedynie wykonać kod, możesz pominąć ten krok.

Patrząc na [kroki instalacyjne](https://github.com/nodejs/help/wiki/Installation) w przypadku Linux (i najprawdopodobniej Windows), jest to dosyć proste:
1. Przejdź do [https://nodejs.org/dist/](https://nodejs.org/dist/).
2. Pobierz pożądaną wersję binarną (np. *node-v12.16.2-linux-x64.tar.gz*).
3. Rozpakuj i właściwie to tyle.

Archiwum możemy umieścić w spakowane wewnątrz JAR-a lub WAR-a. Jeśli umieścimy je w katalogu `src/main/resources`, zostanie ono skopiowany do katalogu `classess` podczas procesu kompilacji. W czasie wykonywania, natomiast, będziemy mogli uzyskać do niego dostęp za pośrednictwem class loadera:
- `getClass().getClassLoader().getResourceAsStream("node-v12.16.2-linux-x64.tar.gz")`;
- `Thread.currentThread().getContextClassLoader().getResourceAsStream("node-v12.16.2-linux-x64.tar.gz")` w przypadku serwera aplikacyjnego.

Docelowo, chcemy odczytać plik w postaci `InputStream`, aby nasza implementacja działała bez względu na to, czy nasze zasoby będą odczytywane z wypakowanego (exploded) czy standardowego archiwum (WAR/JAR/EAR). Zobacz [tę odpowiedź](https://stackoverflow.com/questions/676250/different-ways-of-loading-a-file-as-an-inputstream) na StackOverflow, aby uzyskać więcej informacji na temat ładowania plików za pomocą strumienia wejściowego.

Do rozpakowania NodeJS łatwiej będzie posłużyć się biblioteki pomocniczą, taką jak [jararchivelib](https://rauschig.org/jarchivelib/). Możesz samodzielnie zaimplementować szczegóły, np.: rozpakować do katalogu `/tmp/` lub dowolnego innego, do którego użytkownik uruchamiający aplikację ma uprawnienia do odczytu i zapisu.

## Zbudowanie aplikacji NodeJS

Ponieważ `npm` jest również dołączony do dystrybucji NodeJS, możemy równie dobrze spakować nasz kod źródłowy i skompilować go w trakcie uruchamiania. Proces ten jednak może być zbyt długi i może nie chcieć pakować kodu źródłowego razem. Dostęp do rejestru npm lub repozytoriów git może być również zablokowany z poziomu serwera, na którym aplikacja jest wdrożona.

Istnieją pewne opcje pozwalające na [zainstalowanie pakietów node.js dla innego systemu/architektury](https://stackoverflow.com/questions/24961623/installing-node-js-packages-for-different-architecture), ale są one raczej uciążliwe w wykorzystaniu. Dużo łatwiejsze będzie postawienie środowiska dockerowego do procesu kompilacji i budowania aplikacji. Środowisko to powinno być możliwie ściśle odwzorowywać środowisko docelowe (architektura/system operacyjny/biblioteki natywne). Tylko wtedy będziemy w stanie stwierdzić, czy nie ma problemów z modułami zależnymi od bibliotek natywnych.

Po zbudowaniu aplikacji będziemy chcieli spakować ją na podobnej zasadzie co nasze środowisko NodeJS. Archiwum powinno składać się ze zminimalizowanego skryptu aplikacji i katalogu *node_modules*. Ponieważ *node_modules* może mieć duży rozmiar i liczbę plików, warto odinstalować moduły wymagane jedynie do dewelopmentu: `npm prune --production`.

<img src="/img/hq/node_modules.jpg" alt="node_modules" title="node_modules">

## Uruchomienie aplikacji NodeJS z poziomu Javy

Zakładając, że zaimplementowaliśmy już rozpakowywanie NodeJSa i skompilowanej aplikacji, ostatnim krokiem będzie wywołanie skryptu z poziomu środowiska wykonawczego Java (a właściwie systemu operacyjnego). W tym celu użyjemy klasy `ProcessBuilder`. Drugą opcją jest uruchomienie aplikacji przez `Runtime.getRuntime()`, ale interfejs API poprzedniej jest nieco przyjaźniejszy.

Dwie rzeczy, o których należy wiedzieć, to:
1. Zwykle plik *node* musi mieć ustawiony bit wykonywalny: `new File(sciezkaDoBinNode).setExecutable(true);`.
2. Jeśli istnieje menedżer bezpieczeństwa, jego metoda checkExec jest wywoływana z argumentem pierwszego komponentu tablicy poleceń tego obiektu. Może to spowodować wyrzuceniem wyjątku SecurityException (źródło: [javadoc](https://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html)).

Zdając sobie sprawę z tych dwóch warunków, możemy uruchomić skrypt w następujący sposób:

```java
    ProcessBuilder processBuilder = new ProcessBuilder();
    processBuilder.command(sciezkaDoBinNode, sciezkaDoSkryptuAplikacji);
    Map<String, String> environment = processBuilder.environment();
    environment.putAll(zmienneSrodowiskoweAplikacji);
    processBuilder.inheritIO();
    processBuilder.start().waitFor();
```

Nasz kod uruchomi aplikację przy użyciu dostarczonego środowiska uruchomieniowego NodeJS, wraz z dodatkowymi, zdefiniowanymi przez nas zmiennymi środowiskowymi. Ponadto źródło i miejsce docelowe operacji we / wy zostaną odziedziczone z bieżącego procesu Javy. Oznacza to, że standardowe wyjście aplikacji zostanie domyślnie wydrukowane na konsoli.

W powyższym przypadku obecny wątek zostanie również **za blokowany do czasu zakończenia procesu**. Ważne jest, aby o tym pamiętać, jeśli planujemy uruchomić serwer NodeJS. W takiej sytuacji możesz rozważyć wywołanie powyższego kodu w oddzielnym wątku, aby główny przepływ nie został zablokowany. Ponadto warto wspomnieć, że metoda `waitFor()` może zostać przerwana, w skutek wywołania `interrupt()` na danym wątku. Spowoduje to wyrzucenie wyjątku `InterruptedException` i nastąpi wyjście z tej metody. Nie oznacza to jednak, że proces zakończy swoje działanie.

Aby się zabezpieczyć przed takim "wiszącym" procesem, należy wywołać metodę `destroy()` na obiekcie `Process` zwróconym przez `ProcessBuilder.start()` w bloku `finally`:
```java
    } finally {
        if (process != null && process.isAlive()) {
            process.destroy();
        }
    }
```

Ponadto, istnieją bardzo rzadkie sytuacje, w których wirtualna maszyna Javy będzie musiała zakończyć pracę bez szansy na zwolnienie zasobów (JVM crash). W takim przypadku możemy zostać z uruchomionym procesem NodeJS. Obejściem tego problemu jest zabicie takiego procesu podczas następnego uruchomienia, np. poprzez wywołanie `pkill -f '*node*nazwa_skryptu*`.

### Obsługa wyjścia

Możliwe jest również przekierowanie wyjścia do pliku za pomocą `redirectInput/redirectError`. Dane wyjściowe procesu są przekazywane przez `InputStream`, z którego możemy również czytać ręcznie:

```java
    try (BufferedReader processOutputReader = new BufferedReader(
            new InputStreamReader(process.getInputStream()))) {
        String line;
        while ((line = processOutputReader.readLine()) != null) {
            logger.info(line);
        }
    }
    process.waitFor();
```

Na potrzeby przepływu nieblokującego, ten kawałek kodu również można zawrzeć w oddzielnym wątku.

## Podsumowanie

Uruchomienie NodeJS z Javy jest z pewnością możliwe i możemy nawet stworzyć swojego rodzaju proxy w Javie dla aplikacji NodeJS. Należy jednak rozważyć, czy takie rozwiązanie jest odpowiednie w naszej sytuacji. Może to drastycznie utrudnić utrzymanie projektu.

Warto również zauważyć, że dołączanie NodeJS do serwera aplikacyjnego (Jave EE) może być [bardzo wątpliwym rozwiązaniem](https://www.oracle.com/technetwork/java/restrictions-142267.html). **Jeśli w ogóle**, należy przynajmniej wziąć pod uwagę kontenerowe zarządzanie wielowątkowością i skorzystać z interfejsu, takiego jak `ManagedThreadFactory.newThread()`, na potrzeby tworzenia nowych wątków.

```java
  @Resource
  ManagedThreadFactory threadFactory;
```

Na zakończenie, istnieją również rozwiązania uruchamiające NodeJS bezpośrednio w JVM ([Trireme](https://github.com/apigee/trireme), [Nodyn](https://www.nodyn.io), Avatar-JS). Jednak albo wspierają tylko starsze wersje NodeJS (0.10/0.12) z powodu zakresu kompatybilności Rhino (interpreter JS bazujący na JVM), albo nie są wystarczająco dojrzałe lub też nie są już utrzymywane.