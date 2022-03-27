---
title: Java jako język skryptowy
url: java-jako-język-skryptowy
id: 35
category:
- java: Java
tags:
  - shell
author: Damian Terlecki
date: 2020-07-26T20:00:00
source: https://gist.github.com/t3rmian/500096ab817d653dcd6e4ff8255257f9
---

Pierwszą rzeczą, która przychodzi nam do głowy, gdy myślimy o skryptach, jest bash i narzędzia Linuksowe, takie jak *grep*, *sed* i *awk*. Czasami przygotowanie czystego skryptu w bashu może zająć dużo czasu, szczególnie gdy zadanie nie jest trywialne. Jest to szczególnie problematyczne, jeśli na co dzień nie zajmujemy się pisaniem skryptów.

Do takich zadań, część osób preferuje użycie wygodniejszego języka. Python jest tu dosyć popularnym wyborem ze względu na jego prostą i przejrzystą składnię. Wszelako, jako programista Java rzadko mam okazję pracować z Pythonem. Z wyjątkiem lokalnego środowiska, zwykle muszę zdać się na skrypty bashowe. Ostatnio jednak zacząłem odkrywać Javę w kontekście języka skryptowego.

Ponieważ Java jest dość rozwlekłym (ang. verbose) językiem, może nie być najlepszym wyborem do tworzenia skryptów.
Jednakże wprowadzenie lambd i strumieni w Javie 8, wraz ze słowem kluczowym `var` w Javie 10 (jak również i inne zmiany) znacznie poprawiły wykorzystanie języka w tym obszarze.
Jeśli najczęściej używasz właśnie Javy, to napisanie poprawnego programu w tym języku zajmie Ci prawdopodobnie znacznie mniej czasu niż bash.

Co więcej, wraz z Javą 9 możemy korzystać z JShella, a od Javy 11 nie musimy już jawnie kompilować programów z pojedynczych plików źródłowych. Te ulepszenia umożliwiają nam użycie Javy na wzór języka skryptowego. Oczywiście w tym przypadku etap kompilacji do plików `.class` nie został usunięty, a jedynie przeniesiony do pamięci.

### Wywołanie programu Java ('skryptu')

Do wyboru mamy kilka opcji. Możemy napisać jedną klasę Javy z główną metodą i:
  - **[JDK 11+]** Uruchomić program za pomocą `java Scratch.java` (ze standardową wersją kodu skompilowana pod wybrany JDK) lub `java --source 11 scratch` (bez rozszerzenia bądź ze specyficzną wersją źródłową);
  - **[JDK 11+]** Użyć jako standardowego skryptu korzystając z *shebanga*:
    - dodać `#!/usr/bin/java --source 11` na początku pliku (nazwa pliku powinna być bez rozszerzenia `.java`);
    - dodać uprawnienia do wykonania `chmod +x scratch`;
    - uruchomić skrypt `./scratch`;
  - **[JDK 9+]** Załadować do JShella `jshell Scratch.java` i uruchomić metodę main `Scratch.main()`;
    - z JShella możemy wyjść poleceniem `/exit`.

Przed Javą 9 musieliśmy jawnie skompilować pliki źródłowe przed ich wykonaniem:
1. `javac Scratch.java`;
2. `java Scratch` (nazwa klasa z metodą main umieszczonej w domyślnej ścieżce *classpath*, która wskazuje na bieżący katalog);

co nie było zbyt wygodne. Biorąc pod uwagę te trzy opcje, możemy łatwo wymyślić fajne rozwiązanie, niepolegające na narzędziach Linuksa.

Polecam zapoznać się z nowymi funkcjami API Javy 9-14, takimi jak `mapOf` czy też ulepszeniami związanymi ze String API. Warto również przypomnieć sobie paczkę i klasy `java.nio.file` z Javy 7. Wiedza ta na pewno przyda się podczas pisania skryptów. Odnośnik do przykładowego skryptu, który możesz przetestować, został zamieszczony poniżej.