---
title: Modyfikacja artefaktów Java
url: modyfikacja-artefaktów-java
id: 14
tags:
  - java
  - maven
  - bajtkod
author: Damian Terlecki
date: 2019-10-13T20:00:00
---

Zdarza się, że podczas szukania źródła błędu w systemie znajdujesz je w zewnętrznej bibliotece i po wielu godzinach analizy uświadamiasz sobie, że praktycznie niemożliwe będzie naprawienie nieszczęsnego błędu. Częstym tego powodem jest to, że komponenty są ze sobą ściśle powiązane i nie ma możliwości na ich podmianę, bądź (co gorsze) mamy do czynienia z metodami statycznymi. Java jest jednak dosyć dojrzałym językiem i również w tym zakresie znajdziemy różnego rodzaju rozwiązania pozwalające na obejście tego typu problemów.

#### Proces kompilacji i uruchamiania

Sytuacja w uproszczeniu wygląda następująco: kod Java (pliki .java) jest kompilowany (javac) do kodu bajtowego (pliki .class), a następnie, wraz z pewnymi meta-danymi, pakowany do archiwum ([J|W|E]AR). Klasy umieszczone w takim artefakcie są później ładowane za pomocą ClassLoadera (do pamięci) w środowisku wykonawczym JVM. Ostatecznie bajtkod tych klas jest weryfikowany i kompilowany (przez kompilator JIT) do kody natywnego. W ramach tego procesu można znaleźć wiele sposobów rozwiązania problemu z problematycznymi klasami. Mamy tu szerokie pole do popisu, przede wszystkim możemy:
- [zmienić kolejność klas w ścieżce *classpath*](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/classpath.html#JSWOR590), aby w pierwszej kolejności załadować poprawioną klasę (o tej samej nazwie i pakiecie);
- zaimplementować własnego [ClassLoadera](https://docs.oracle.com/javase/10/docs/api/java/lang/ClassLoader.html), który w miejsce błędnej klasy załaduje poprawioną jej wersję (uwaga na załadowanie przez więcej niż jeden ClassLoader);
- użyć [instrumantacji](https://docs.oracle.com/javase/10/docs/api/java/lang/instrument/package-summary.html) i zaimplementować własnego agenta Javy, który zajmie się redefinicją / retransformacją klas (z pewnymi ograniczeniami);
- usunąć klasę z archiwum artefaktu i zaimplementować własną.

<img src="/img/hq/bajtkod.svg" alt="Bajtkod" title="Bajtkod">

Każdy, kto kiedykolwiek podejrzał, jak wygląda kod bajtowy, prawdopodobnie zgodzi się, że manipulowanie nim może nie należeć do najprostszych zadań w życiu programisty. Na szczęście istnieje wiele bibliotek, które mogą w tym pomóc, takich jak ByteBuddy, Javassist lub ASM. Sam miałem okazję ich użyć do naprawy błędów ukrytych w metodach statycznych bibliotek zewnętrznych. Często jednak manipulacja kodem bajtowym lub dodawanie własnych ClassLoaderów może być niemile widziana, szczególnie gdy możliwość modyfikowania skryptów uruchomieniowych/kolejności ładowania klas jest ograniczona.

#### Modyfikacja artefaktów Java

W szczególnych przypadkach jedną z możliwych opcji uporania się ze zbugowaną klasą jest jej usunięcie z archiwum i zaimplementowanie własnej. Doskonałym przykładem może być komponent MDB (Message Driven Bean) w Javie biznesowej. Zazwyczaj takie elementy są luźno powiązane, a ich usunięcie, poza zaprzestaniem działania danej funkcjonalności, nie powinno wiązać się z większymi nieprzyjemnościami. Przed wykonaniem tej czynności polecam jednak sprawdzenie wszelkich deskryptorów wdrożeniowych oraz konfiguracji serwerów aplikacyjnych, w celu zachowania ustalonej konfiguracji. To rozwiązanie nie jest zbyt eleganckie, ale pozwala podmienić zepsuty komponent, dopóki biblioteka, z której korzystamy, nie zostanie naprawiona.

Usunięcie klasy jest proste i sprowadza się do rozpakowania archiwum, usunięcia jej i spakowania ponownie. Dzięki Mavenowi możliwe jest zautomatyzowanie tego procesu na etapie przygotowania paczki za pomocą wtyczki, takiej jak np. [truezip-maven-plugin](https://www.mojohaus.org/truezip/truezip-maven-plugin/):

```xml
&lt;plugins&gt;
  &lt;plugin&gt;
    &lt;groupId&gt;org.codehaus.mojo&lt;/groupId&gt;
    &lt;artifactId&gt;truezip-maven-plugin&lt;/artifactId&gt;
    &lt;version&gt;1.2&lt;/version&gt;
    &lt;executions&gt;
      &lt;execution&gt;
        &lt;id&gt;remove-a-file&lt;/id&gt;
        &lt;goals&gt;
          &lt;goal&gt;remove&lt;/goal&gt;
        &lt;/goals&gt;
        &lt;phase&gt;package&lt;/phase&gt;
        &lt;configuration&gt;
          &lt;fileset&gt;
            &lt;directory&gt;${project.build.directory}/com.example.project.ear/lib/com.example.library.jar/&lt;/directory&gt;
            &lt;includes&gt;
              &lt;include&gt;com/example/library/Broken.class&lt;/include&gt;
            &lt;/includes&gt;
          &lt;/fileset&gt;
        &lt;/configuration&gt;
      &lt;/execution&gt;
    &lt;/executions&gt;
  &lt;/plugin&gt;
&lt;/plugins&gt;
```

W zależności od tego, czy ładować będziesz (serwer) spakowaną paczkę czy też rozpakowane (exploded) archiwum, może zajść potrzeba dodatkowej konfiguracji wtyczki. Ten sposób nie jest zbyt elegancki i nie zawsze można go wykorzystać, warto jednak o nim pamiętać, gdyż w ostateczności może się przydać. Szczególnie gdy hotfix jest potrzebny na wczoraj, a klient z każdą sekundą traci pieniądze.