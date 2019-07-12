---
title: JMeter — testy funkcjonalne API RESTowego
url: jmeter-rest-testy
id: 6
tags:
  - jmeter
  - testy
  - rest
author: Damian Terlecki
date: 2019-06-23T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

Chociaż JMeter jest stosowany głównie do testów obciążeniowych, to może również być uzasadnionym wyborem w dla testów funkcjonalnych. W pierwszej kolejności zacznijmy od usług REST-owych. Dwie niezbędne rzeczy potrzebne do takich testów to oczywiście możliwość wywołania metody API, a więc wysłania podstawowego zapytania HTTP, oraz możliwość weryfikacji zwróconych danych. Obie funkcjonalności dostępne są z poziomu narzędzia. Co więcej JMeter daje również możliwość połączenia się, bez nadmiernej konieczności konfiguracji (oprócz dodania sterownika dla mniej popularnych). Domyślnie, narzędzie zapewnia praktycznie wszystko, czego potrzeba, a kwestie niewygodnej obsługi nadrabia systemem rozszerzeń (ang. plugins). Warto tutaj wspomnieć o dosyć niskim progu wejścia dla mniej zorientowanych programistycznie testerów. Ponieważ jednak samodzielne domyślenie się wszystkiego może zająć trochę czasu, dzisiaj pokażę kilka prostych przykładów, które powinny ułatwić tworzenie pierwszych testów.

Weźmy proste [RESTowe API CRUD z minimalną logiką](http://t3rmian.github.io/jmeter-samples) jako przykład i przejdźmy prosto do testów. Podstawowa struktura testów w JMeterze składa się z:
1. Planu testowego (korzeń główny);
2. Elementów konfiguracji (konfiguracja połączenia z bazą danych, parametry użytkownika, domyślne ustawienia zapytań);
3. Grupy wątków — symuluje wielu użytkowników lub wiele wykonań testów;
4. Samplera (HTTP Request Sampler/JDBC Request Sampler) — odpowiednik pojedynczego testu;
5. Asercji — weryfikują dane pod różną postacią (odpowiedź HTTP/JSON/XML) i w różny sposób (GUI/JSR232).

Na początek sprawdźmy coś prostego np., `GET /v1/users/{id}` ze wspomnianego wcześniej API. Idealnie byłoby, gdyby parametr wejściowy `id` był losowo wybierany z bazy danych. Metoda powinna zwrócić poprawne dane użytkownika, a w przypadku, gdy jego usunięcie, zwrócić błąd 404. Jest to dosyć popularna sytuacja. Wyobraź sobie, że twoja aplikacja już działa, ma jakiś interfejs graficzny i teraz następuje potrzeba udostępnienia tych samych danych przy użyciu interfejsu REST-owego. Zazwyczaj dosyć łatwo jest sprawdzić, z jakich kolumn tabeli dane pochodzą, ale ponowne użycie istniejącej logiki może być niewygodne z różnych względów (np. źle zaprojektowana warstwa DAO). Nawet jeśli taki problem nie istnieje, to istniejąca logika może również być nieprzetestowana i zawierać błędy dla nietypowych stanów i przypadków brzegowych. Jeśli jednak masz wystarczająco duży zestaw danych, to możliwe jest przeprowadzanie wielu testów dla losowo wybranych danych z bazy, co pozwoli na ich wykrycie bez analizy kodu. Bardzo łatwo jest je również przekształcić do testów obciążeniowych i wykryć problemy z wydajnością bądź wielowątkowością.

Wracając do tematu, przejdźmy teraz przez każdy z 5 kroków wymienionych powyżej, nakreślając przykładowe wykorzystanie.:

### Plan testowy

*Test Plan* to korzeń wszystkich elementów w JMeterze. Pod tym elementem można dodać między innymi zmienne przypisane do użytkownika (do których odwołanie jest możliwe za pomocą składni `${nazwa_parametru}), wybrać jak powinny być wywoływane kolejne grupy wątków (np. w izolacji) oraz dodać paczkę `.jar` do classpatha. Zazwyczaj wszystkie paczki ładowane są domyślnie z katalogu `jmeter/lib` i powinny standardowo zadziałać, jeśli tylko je tam umieścimy.

<img src="/img/lazy/jmeter/test-plan.jpg" data-src="/img/hq/jmeter/test-plan.jpg" alt="Plan testowy" title="Plan testowy">

### Elementy konfiguracji

W ramach planu testów polecam dodanie elementu **View Results Tree**, który pozwala na wyświetlenie drzewa wyników.

<img src="/img/lazy/jmeter/view-results-tree.jpg" data-src="/img/hq/jmeter/view-results-tree.jpg" alt="Widok drzewo wyników" title="Widok drzewo wyników">

Widok ten pokazuje wyniki testów (samplerów). Oprócz tego wyświetlają się tu również czy testy zakończył się powodzeniem oraz jakie dane zostały wysłane i co otrzymaliśmy w odpowiedzi. W tym miejscu można również podać ścieżkę do pliku w celu wygenerowania raportu. Aby wyczyścić rezultaty przed ponownym uruchomieniem testów, wystarczy nacisnąć przycisk *Clear* na pasku narzędzi, bądź wybrać z *Menu -> Run -> Clear*.

<img src="/img/lazy/jmeter/view-results-tree-response.jpg" data-src="/img/hq/jmeter/view-results-tree-response.jpg" alt="Dane odpowiedzi" title="Dane odpowiedzi">

Kolejnym przydatnym elementem jest **HTTP Requests Defaults**. Element ten pozwala na ustawienie standardowej konfiguracji dla samplera *HTTP Request*. Jest to bardzo przydatne podczas przeprowadzania testów na wielu środowiskach, gdyż jest to jedyne miejsce, w którym będzie trzeba wprowadzić zmiany dotyczące lokalizacji serwera.

<img src="/img/lazy/jmeter/http-jdbc-request-defaults.jpg" data-src="/img/hq/jmeter/http-jdbc-request-defaults.jpg" alt="Domyślne żądania HTTP i Konfiguracja połączenia JDBC" title="Domyślne żądania HTTP i Konfiguracja połączenia JDBC">
<img src="/img/lazy/jmeter/http-request-defaults.jpg" data-src="/img/hq/jmeter/http-request-defaults.jpg" alt="Domyślne żądania HTTP" title="Domyślne żądania HTTP">

Ostatni ważnym w naszym przypadku elementem konfiguracji jest **JDBC Connection Configuration**. Element ten konfiguruje połączenie z bazą danych poprzez sterownik JDBC. Ważą rzeczą, o której warto pamiętać, jest nazwa zmiennej utworzonej puli połączeń. Będziemy się do niej odnosić podczas tworzenia samplera *JDBC Request*.

<img src="/img/lazy/jmeter/jdbc-connection-configuration.jpg" data-src="/img/hq/jmeter/jdbc-connection-configuration.jpg" alt="Konfiguracja połączenia JDBC" title="Konfiguracja połączenia JDBC">

### Grupy wątków

Jest to punkt wejściowy naszych przypadków testowych. Trzy główne rzeczy, które powinny nas tu zainteresować to: działanie, jakie należy podjąć po błędzie samplera; liczba użytkowników (wątków) i liczba pętli (ponowynch wywołań).

<img src="/img/lazy/jmeter/threads.jpg" data-src="/img/hq/jmeter/threads.jpg" alt="Wątki (użytkownicy)" title="Wątki (użytkownicy)">
<img src="/img/lazy/jmeter/thread-group.jpg" data-src="/img/hq/jmeter/thread-group.jpg" alt="Grupa wątków" title="Grupa wątków">

### Samplery

Dwa główne samplery, których będziemy używać do testów API REST-owego to **HTTP Request** i **JDBC Request**. W zależności od przypadku testowego możliwe jest użycie jednego z nich jako samplera, a drugiego jako pre/post procesora. **HTTP Request** wygląda w zasadzie tak samo jako wcześniej wspomniany *HTTP Requests Defaults*. **JDBC Request** jest natomiast nieco bardziej skomplikowany:

<img src="/img/lazy/jmeter/samplers.jpg" data-src="/img/hq/jmeter/samplers.jpg" alt="Samplery" title="Samplery">
<img src="/img/lazy/jmeter/jdbc-request.jpg" data-src="/img/hq/jmeter/jdbc-request.jpg" alt="Zapytanie JDBC" title="Zapytanie JDBC">

Warunkiem koniecznym do działania tego samplera jest ustawienie nazwy puli połączeń zgodnej z nazwą zdefiniowaną w *JDBC Connection Configuration*. Następnie wybieramy typ zapytania. Warto pamiętać, że po każdym insercie powinien nastąpić commit. W przypadku niektórych baz danych konieczne będzie również usunięcie średnika postawionego na końcu zapytania, w przeciwnym razie zwrócony zostanie błąd. Na koniec jest jeszcze dolny formularz. 

Zazwyczaj ignoruję dwa pierwsze pola, które umożliwiają standardową parametryzację w stylu JDBC. W większości przypadków do parametrów odwołuję się bezpośrednio wewnątrz zapytań, używając składni `${nazwa_parametru}`. W kolejne pole "variable names" należy już wpisać nazwy zmiennych, pod które zostaną załadowane kolejne wartości kolumn z odpowiedzi zapytania. Ładowanie następuje w sposób sekwencyjny, do nazwy dodawany jest postfix z numerem zwróconego wiersza zaczynając od 1 np. `id_1`, `id_2`. Przez `${id_#} będziesz mógł odnosić się do liczby zwróconych wierszy. Możliwe jest również wykorzystanie "result set" (następne pole), które zapewnia dostęp do wyników w postaci obiektu — listy (wierszy) map (wartości kolumn).

Aby przetestować metodę RESTową GET należy dodać sampler **HTTP Request** dla (w naszym przypadku) ścieżki `/v1/users/${userId_1}`. W założeniu lokalizacja serwera powinna była być ustawiona w *HTTP Requests Defaults*, jednak można to samo uczynić również tutaj. Zauważ parametr `${userId_1}`, zostanie on uzupełniony dzięki preprocesorowi. Kolejnym krokiem jest dodanie właśnie dodanie **JDBC PreProcessor** aby wyciągnąć tę wartość z bazy danych:

<img src="/img/lazy/jmeter/jdbc-pre-processor.jpg" data-src="/img/hq/jmeter/jdbc-pre-processor.jpg" alt="PreProcessor JDBC" title="PreProcessor JDBC">

```sql
SELECT ID, NAME, EMAIL
FROM USERS
ORDER BY RAND()
```
Preprocesor zostanie ukryty w drzewie wyników. Jest to dobra i zła rzecz — trudniej będzie wykryć jakiekolwiek błędy w zapytaniu, ale nie zostanie ono pokazane jako przypadek testowy w widoku lub statystykach. Możesz oczywiście użyć **JDBC Request**, jeśli nie Ci to nie odpowiada. Ustaw nazwy zmiennych na *userId, name, email*.  Będą one dostępne poprzez `${userId_1}`, `${name_1}`, `${email_1}`, `${userId_2}`, `${name_2}`, … Głównym zamysłem naszych testów jest to, że weryfikujemy jedynie pierwszego użytkownika, a losowość wprowadzamy na poziomie bazy danych poprzez dodanie `ORDER BY RAND()`. Dzięki temu kolejne testy będą wykonywane dla innego, losowego użytkownika. Jeśli chcemy wykonać więcej testów, wracamy do *Thread Group* i zmieniamy liczbę pętli.

Jeżeli wymagane jest przekazanie ciała JSON w metodzie takiej jak POST lub PUT, to podczas wysyłania żądania należy ustawić nagłówek `Content-Type=aplikacja/json`. Aby to zrobić, wystarczy dodać **HTTP Header Manager** pod *HTTP Request* i umieścić tam taką wartość.

<img src="/img/lazy/jmeter/http-header-manager.jpg" data-src="/img/hq/jmeter/http-header-manager.jpg" alt="Menadżer nagłówków HTTP" title="Menadżer nagłówków HTTP">
<img src="/img/lazy/jmeter/content-type.jpg" data-src="/img/hq/jmeter/content-type.jpg" alt="Content-Type=application/json" title="Content-Type=application/json">

### Asercje

Asercje są kluczowymi elementami służącymi do sprawdzenia, czy dane pochodzące z samplera odpowiadają oczekiwanym wartościom. Najbardziej podstawową asercją jest **Response Assertion**. Jakkolwiek elementarnie może brzmieć nazwa, asercja ta pozwala na sprawdzenie większości wymaganych rzeczy. Po pierwsze, możemy wybrać, gdzie ją zastosować — do głównej próbki czy jakiejś wyodrębnionej zmiennej. Następnie wybieramy co przetestować — odpowiedź tekstową (treść), kod (status), nagłówki itp. Zauważ pole wyboru "ignore status". Domyślnie, wykonanie samplera zostanie wyświetlone jako nieudane, jeśli status odpowiedzi będzie wskazywał na niepowodzenie. W naszych testach możemy jednak chcieć sprawdzić, czy błędy są poprawnie zwracane w konkretnych przypadkach. W takiej sytuacji należy zaznaczyć te pole i dokonać weryfikacji statusu. Na dole można wpisać niestandardowy komunikat o niepowodzeniu, jednak opisowe nazwy asercji wraz ze standardowymi komunikatami na ogół wystarczają.

<img src="/img/lazy/jmeter/assertions.jpg" data-src="/img/hq/jmeter/assertions.jpg" alt="Asercje" title="Asercje">
<img src="/img/lazy/jmeter/response-assertion.jpg" data-src="/img/hq/jmeter/response-assertion.jpg" alt="Asercja odpowiedzi" title="Asercja odpowiedzi">

**JSON Assertion** to kolejny wyspecyfikowany element, który pozwala na weryfikację odpowiedzi w formacie JSON. Niestety w tym przypadku nie można wybrać do tego celu żadnej zmiennej niestandardowej. Jeśli jednak istnieje takie wymaganie, możliwe jest uzyskanie podobnych rezultatów, łącząc *PostProcessor JSON Extractor* i *Response Assertion*. Element ten wykorzystuje JSON Path. W swojej domyślnej konfiguracji sprawdza, czy ścieżka istnieje. Dodatkowe opcje pozwalają na porównanie wartości, dopasowanie za pomocą RegExa lub odwrócenie asercji. Wracając do naszego API, możemy chcieć sprawdzić, czy nazwa odpytywanego użytkownika odpowiada wartości z bazy danych. Aby to zrobić, należy wpisać `$.name` w ścieżce JSON, zaznaczyć opcję "Additionally assert value" i wpisać ${name_1} (parametr pobrany przez *JDBC PreProcessor*) jako wartość oczekiwana. Aby zwizualizować ścieżkę JSON, można również wrócić do *View Results Tree*, przełączyć na "JSON Path Tester", wybrać sampler z drzewa (po wykonaniu testu), wprowadzić wyrażenie i nacisnąć test.

<img src="/img/lazy/jmeter/json-assertion.jpg" data-src="/img/hq/jmeter/json-assertion.jpg" alt="Asercja JSON" title="Asercja JSON">

Na koniec, najpotężniejsza asercja — **JSR223** — to element, który pozwala na użycie języka skryptowego w celu weryfikacji danych. Wymaga to pewnej wiedzy programistycznej, ale w zamian umożliwa praktycznie wszystko. W jednym stwierdzeniu można zweryfikować całą odpowiedź, nawet przy złożonych, hierarchicznych strukturach, które zawierają kolekcje. W tym przypadku najczęściej wybieram język Groovy, gdyż jest on dosyć szybki oraz z powodu stylu językowego. Warto zaznaczyć, że nie otrzymamy zbytniej pomocy ze strony edytora. Jeśli preferujesz, możesz równie dobrze użyć BeanShella lub JS-a. Zazwyczaj weryfikacja następuje w oparciu o **JDBC result set** (w tym przypadku `dbUser` jako nazwa zmiennej result set z *JDBC PreProcessor*), skąd dane porównujemy z odpowiedzią serwisu REST-owego:

```groovy
import groovy.json.JsonSlurper

def user = new JsonSlurper().parse(prev.getResponseData(), 'UTF-8')
def dbUser = vars.getObject("dbUser").get(0)

assert dbUser.get("ID") == user.id
assert dbUser.get("NAME") == user.name : "O nie! Email nie pasuje"
```

<img src="/img/lazy/jmeter/jsr223-assertion.jpg" data-src="/img/hq/jmeter/jsr223-assertion.jpg" alt="Asercja JSR223" title="Asercja JSR223">

### Wskazówki

Jeśli wolisz nie używać *JSR223* i masz do czynienia ze złożonymi strukturami, możesz spróbować połączenia asercji JSON i asercji odpowiedzi z okazjonalną ekstrakcją wartości (*extractors*). Jedną z wad JMetera jest to, że dość trudno jest jednocześnie zweryfikować kolekcje elementów z bazą danych wyłącznie przy użyciu elementów GUI. Rozwiązaniem tego problemu jest użycie kontrolerów logicznych, np. **ForEach Controller**. Dzięki temu elementowi możemy wywołać sampler tyle razy, ile jest elementów w kolekcji. Na przykład, jeśli użytkownik ma wiele profili, możemy przeszukiwać bazę danych dla wszystkich identyfikatorów profili i dla każdego z nich wykonać **HTTP Request** w celu sprawdzenia poprawności każdego z nich z bazą danych. Innym rozwiązaniem jest tworzenie małych randomizowanych testów, które sprawdzają poprawność małych części interfejsu/zwracanych danych (rozwiązanie te ma swoje plusy i minusy). Ostatecznie, nie zapomnij dodać elementu **Debug Sampler** podczas tworzenia testów. Przyda się on w celu podejrzenia wartości zmiennych w drzewie wyników.

<img src="/img/lazy/jmeter/logic-controllers.jpg" data-src="/img/hq/jmeter/logic-controllers.jpg" alt="Kontrolery logiczne" title="Kontrolery logiczne">
<img src="/img/lazy/jmeter/foreach-controller.jpg" data-src="/img/hq/jmeter/foreach-controller.jpg" alt="Kontroler ForEach" title="Kontroler ForEach">

Ze względu na pewne znane i nierozwiązane problemy, funkcje cofania i ponownego wykonywania w JMeter są domyślnie wyłączone. Aby to włączyć, dodaj linię `undo.history.size=30` na koniec pliku `jmeter/bin/jmeter.properties`. Po tej czynności przyciski cofania i powtórzenia powinny pojawić się na pasku narzędzi i możliwy będzie dostęp do funkcji z menu 'Edit'.

Sprawdź również projekt źródłowy (link u góry strony), aby sprawdzić JMetera na działającym przykład. Projekt jest w zasadzie *standalone*, wymaga jedynie pobrania paczki ze sterownikiem H2 (przeczytaj README) dla JMetera. Jeśli chciałbyś/chciałabyś sprawdzić swoich sił z narzędziem — mam dla Ciebie ćwiczenie. Przynajmniej w jednym miejscu w [specyfikacji](http://t3rmian.github.io/jmeter-samples) celowo wynikła pewna nieścisłość, przeczytaj opis i spróbuj wykryć błąd używając JMetera. Jeśli nie wpadniesz na pomysł, co jest źle, to zapoznaj się z [dodatkową wiadomością commita](https://github.com/t3rmian/jmeter-samples/commit/332ae86d42d946fc25dcdf29ba3729b2522cd6e2).

## Podsumowanie

JMeter może nie być najlepszym narzędziem do funkcjonalnego testowania usług REST-owych, daje ono nam jednak praktycznie wszystko, czego moglibyśmy potrzebować. Z mojego punktu widzenia istnieją co najmniej trzy mocne strony tego narzędzia dla tego zastosowania. Pierwszą z nich jest możliwość weryfikacji danych w oparciu o bazy danych. Jest to bardzo pożądane, gdy Twoje API nie oferuje (jeszcze lub w ogóle) pełnego interfejsu umożliwiającego testowanie typu end-to-end. Nie musisz ręcznie przygotowywać żadnych danych testowych. Po drugie, można łatwo i szybko wykonywać testy na innych środowiska z inną konfiguracją bądź wersją interfejsu. Wreszcie, bardzo łatwo jest przekonwertować przypadki testowe na testy obciążeniowe i wcześnie zweryfikować wszelkie problemy z wydajnością i wątkami. Z drugiej strony, jak można zauważyć, nie jest to narzędzie najprzyjaźniejsze programistom.