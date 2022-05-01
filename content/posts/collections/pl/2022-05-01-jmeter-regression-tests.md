---
title: Prosty test regresji web serwisu w JMeterze
url: jmeter-web-service-testy-regresji
id: 85
category:
  - testing: Testy
tags:
  - jmeter
  - web services
author: Damian Terlecki
date: 2022-05-01T20:00:00
source: https://gist.github.com/t3rmian/293a8933ed0952cb47e22328a5c3ffc0
---

JMeter to zaawansowane narzędzie pozwalające na przygotowanie różnego rodzaju testów.
Różnego rodzaju samplery pozwalają na wprowadzenie danych z różnych źródeł, co znacznie upraszcza przygotowanie przypadków testowych.
Uzyskanie biegłości w posługiwaniu się JMetererem nie jest jednak proste i brak pewnego rodzaju *IntelliSense* na pewno w tym nie pomaga.
Jednakże podstawowa znajomość wystarczy nam do przygotowania prostych testów regresji, na przykład podczas weryfikacji web serwisów.

## Regresja w wersjonowanym API

W najprostszej formie regresję możemy wykryć, porównując odpowiedzi z danego endpointu w dwóch różnych wersjach.
Do tego potrzebować będziemy danych wejściowych, które pozwolą na przejście po kolejnych zasobach HTTP.
Dane te załadujemy za pomocą zmiennych użytkownika w planie testów, elemencie konfiguracyjnym pliku CSV lub
przy wykorzystaniu samplera JDBC/HTTP.

<figure class="flex">
<img src="/img/hq/jmeter-regression-tests/jmeter-test-plan.png" alt="JMeter User Variables" title="JMeter User Variables">
<img src="/img/hq/jmeter-regression-tests/jmeter-jdbc-sampler.png" alt="JMeter JDBC Sampler" title="JMeter JDBC Sampler">
</figure>

Mając dane wejściowe, do kontrolera ForEach dodajemy dwa samplery HTTP dla obu wersji interfejsu API.
Pod pierwszym samplerem *Response Assertion* pozwoli nam na wyłączenie weryfikacji statusu odpowiedzi.
Krok ten pozwoli na późniejszą weryfikację nie odpowiedzi, a zmian pomiędzy odpowiedziami.
Za pomocą ekstraktora wyrażeń regularnych zapiszemy interesujące nas dane do zdefiniowanej zmiennej.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-foreach-controller.png" alt="JMeter ForEach Controller" title="JMeter ForEach Controller">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regex.png" alt="JMeter Expression Extractor" title="JMeter Expression Extractor">
</figure>

W drugim samplerze *Response Assertion* posłuży nam właśnie do porównania odpowiedzi względem wcześniej zapisanej zmiennej.
Wszelkie zmiany w odpowiedzi między dwiema wersjami tego samego punktu końcowego zostaną podświetlone w drzewie wyników.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-response-assertion.png" alt="JMeter Response Assertion" title="JMeter Response Assertion">

Nie wszystkie różnice można uznać za regresję. W najprostszej formie test sprawdzi się w przypadku zmian niefunkcjonalnych (optymalizacja, refaktoryzacja).
Dla zmian funkcjonalnych konieczna będzie zmiana zakresu REGEX bądź użycie dodatkowych Ekstraktorów (JSON) w celu porównania konkretnych części odpowiedzi.

## Regresja w niewersjonowanym API

Innym podejściem, z którego możesz skorzystać, jest porównanie wyników względem pliku bazowego. Jest to szczególnie przydatne, gdy:
- masz niewersjonowane API;
- zmiany są wdrażane w wyniku przełączenia wewnętrznej flagi;
- chcesz wykryć regresje pomimo braku zmian.

Plan testów jest prosty, jeśli nie potrzebujesz przetwarzać odpowiedzi.
Wystarczy użyć drzewa wyników do zapisania rezultatów samplera.
W kolejnym etapie, np. po wdrożeniu bądź przełączeniu flagi, powtarzamy test i porównujemy pliki wyjściowe.

Z kolei do porównania wyodrębnionych wcześniej części odpowiedzi, najprostszym sposobem będzie skorzystanie z jednoliniowego samplera JSR223.
W skrypcie po prostu wyświetlamy dane zapisane w zmiennej za pomocą pojedynczej linii `vars["responseV1"]`. Drzewo wyników dodajemy wyłącznie pod samplerem JSR223.
Tym sposobem w pliku zapiszą się jedynie wyodrębnione części odpowiedzi, które przykładowo nie powinny się zmieniać.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-save-results-tree.png" alt="JMeter View Results Tree" title="JMeter View Results Tree">

Teraz, aby porównać zawartość, przełącz wykonanie grup wątków na sekwencyjne (na poziomie planu testów).
Dzięki temu plik zostanie zapisany w jednej grupie wątków, a następnie odczytany i zweryfikowany w innej.
Uruchomienie porównania jest wyjątkowo proste. Poprzez *OS Process Sampler* możemy użyć polecenia systemowego `diff` na obu plikach.
Tutaj warto pamiętać o skonfigurowaniu oczekiwanego kodu powrotu.
Alternatywnie, niezależnie od systemu możemy przykładowo skorzystać z *Debug Samplera* i:
- zawartość plików zapisać dzięki preprocesorowi parametrów użytkownika i funkcji: `${__FileToString(testResults1.xml)}`;
- porównać zmienne za pomocą *Response Assertion*.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-os-process-sampler.png" alt="JMeter OS Process Sampler" title="JMeter OS Process Sampler">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-user-parameters.png" alt="JMeter User Parameters" title="JMeter User Parameters">
</figure>

Opisany możliwości możesz przetestować w wersji JMeter 5.4.3 stubując odpowiedzi przy użyciu zwykłego serwera HTTP, `jwebserver` (program) z Javy 18.
Odpowiednie pliki źródłowe znajdziesz na dole strony.
Możesz wykorzystać je jako punkt wyjścia do własnych testów regresji.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regression-test.png" alt="JMeter Test Plan" title="JMeter Test Plan">
