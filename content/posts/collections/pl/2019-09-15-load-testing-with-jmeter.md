---
title: JMeter — testy obciążeniowe
url: testy-obciążeniowe-jmeter
id: 12
tags:
  - jmeter
  - testy
author: Damian Terlecki
date: 2019-09-15T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

JMeter to świetne narzędzie do testowania. Świeci szczególnie dobrze nadaje się do testów obciążeniowych. Pozwala nie tylko na sprawdzenie wydajność aplikacji lub bazy danych przy użyciu różnych interfejsów, ale umożliwia również generowanie różnych poziomów obciążenia, symulując jednoczesny napływ wielu użytkowników. W zależności od przypadku użycia możemy być zainteresowani różnymi aspektami naszego systemu:
* jakie jest maksymalne obciążenie, które jest w stanie wytrzymać system;
* jaki element jest wąskim gardłem:
    - baza danych;
    - backend;
    - poszczególne mikroserwisy;
    - frontend;
* czy system jest skalowalny (pionowo/poziomo);
* czy równoważenie obciążenia (ang. load balancing) działa poprawnie;
* czy system jest optymalnie skonfigurowany i optymalnie zeskalowany pod względem różnych komponentów.

### Analiza

Przed przystąpieniem do przygotowywania testów, należy zastanowić się, w jaki sposób nasz system jest używany i wydzielić najpopularniejsze przypadki użycia. Na tym etapie ważnie jest, aby pamiętać również o zadaniach wykonywanych w tle oraz szczególnych funkcjonalnościach, które mogą być używane sporadycznie, ale w połączeniu ze wzrostem obciążenia sprawią, że system "spadnie z rowerka". Kolejnym krokiem po zdefiniowaniu, które interfejsy powinny zostać przetestowane z odpowiednim rozkładem wykorzystania, jest zaplanowanie kolejności wywołań oraz minimalnych limitów czasowych. Warto tutaj wziąć pod uwagę różne aspekty systemu. Dobrym pomysłem jest wybór odpowiedniego zakresu czasowego, który pozwoli na przynajmniej kilkukrotne wywołanie odśmiecacza (ang. garbage collector). Z kolei odpowiednio przygotowana kolejność wywołań z nutką losowości umożliwi osiągnięcie najgorszego przypadku dla warstw buforujących (ang. cache) na poziomie bazy danych i aplikacji. Ostatecznie — konieczne będzie określenie liczby użytkowników, którzy uderzą w system jednocześnie oraz kolejne punkty wzrostu obciążenia.

Przy ustalaniu planu testów warto również pochylić się nad zagadnieniami takimi jak:
* na jakim środowisku będą wykonywane testy:
    - połączenie;
    - sprzęt;
    - oprogramowanie;
    - konfiguracja;
    - porównanie do środowiska produkcyjnego;
* czy potrzebna jest kopia zapasowa (ang. backup);
* czy jedna maszyna będzie w stanie wygenerować planowane obciążenie;
* czy wszystkie osoby są wstępnie przeszkolone do przeprowadzania testów i mają niezbędne dostępy;
* jakie inne narzędzia będą potrzebne do celów monitorowania (np. Zipkin/Kibana/Nagios);
* w jaki sposób dane wejściowe zostaną pozyskane i załadowane do testów:
    - z bazy danych podczas wykonywania testów;
    - z bazy danych podczas inicjacji testów;
    - z wcześniej przygotowanego pliku z danymi;
* co jest właściwym celem testów;
* jak przeanalizować wyniki i jakiego rodzaju raporty przygotować.

Jak widać, istnieje wiele punktów, które należy wziąć pod uwagę podczas analizy. Właściwy plan jest niezbędny do uzyskania wartościowych wyników, które pozwoliłyby na porównanie również z poprzednimi/przyszłymi testami.

### Przykładowa implementacja

Obciążeniowy plan testowy w JMeterze zazwyczaj składa się z następujących kroków [elementów]:
1. Konfiguracja (opcjonalnie sparametryzowana) połączenia z interfejsami [*Test Plan/User Variables Config/Config Defaults*].
2. Wczytanie danych wejściowych [*setUp Thread Group*]:
    - z bazy danych [*JDBC Config/Sampler*];
    - z pliku CSV [*CSV Config*].
3. Przygotowanie przypadków testowych [*Thread Group*]:
    - wylosowanie danych wejściowych dla pojedynczego przypadku/wywołania [*CSV Config/JSR223 Pre Processor*];
    - proporcjonalne wylosowanie interfejsu [*Controllers*];
    - określenie dodatkowych warunków:
        - liczba wątków do zebrania w grupę w celu wytworzenia pików [*Timers*];
        - dodatkowe wywołania interfejsów, które powinny nastąpić sekwencyjnie [*Samplers*].
4. Dodanie widoku z rezultatami i statystykami do monitorowania testu [*Listeners*].

<img src="/img/lazy/jmeter/jmeter-load-tests.jpg" data-src="/img/hq/jmeter/jmeter-load-tests.png" alt="Obciążeniowy plan testowy" title="Obciążeniowy plan testowy">

Wartościową wskazówką jest to, że im prostsze są testy, tym szybciej zostaną one wykonane i będziemy w stanie wygenerować większe obciążenie. Upraszczając je, zmniejszamy liczbę możliwych punktów awarii. Jako przykład weźmy krok 2. Jeśli zdecydujemy się połączyć z bazą danych w naszych testach, zwiększymy złożoność testów i dodajemy nie zawsze konieczną zależność, co może rodzić niewielkie problemy. Na przykład nie zaleca się przechowywania hasła do bazy danych wewnątrz testów. Możemy udostępniać je do sprawdzenia, umieszczać w repozytorium lub przekazywać je osobom, które wykonają je poza godzinami pracy. Nie każdy, kto ma do nich dostęp, ma również / powinien mieć dostęp do właściwej bazy danych. Możliwe jest również podanie błędnych danych uwierzytelniających, co w najlepszym przypadku będzie skutkowało jedynie utratą czasu (ograniczone okno czasowe?) a w najgorszym — zablokowanie użytkownika na bazie danych.

Inny problem może wystąpić, gdy będziemy chcieli wygenerować bardzo duże obciążenie, zwiększając liczbę równoległych testerów (maszyn). Jeśli nie zsynchronizujemy zapytań do bazy danych o dane wejściowe, możliwe, że aplikacja szybko zarezerwuje wszystkie zasoby (połączenia). W takim przypadku możemy nie doczekać się odpowiedzi już na samym etapie pozyskiwania danych. Dlatego w takim przypadku preferowane jest wstępne przygotowanie danych wejściowych, np. dzień wcześniej.

Przykładową implementację możesz podejrzeć, odwiedzając źródła, do których odnośnik znajduje się na dole strony. Załączony projekt to aplikacja internetowa (Java/Spring) wystawiająca interfejs REST-owy i zawierająca kilka prostych testów obciążeniowych. Uruchomienie jej jest dosyć proste, jednak wymaga zapoznania się z plikiem README w celu prawidłowej konfiguracji (konieczne jest pobranie JMetera wraz ze sterownikiem bazy danych).

#### Zakres zmiennych w JMeterze

W JMeter zmienne (ang. variables) mają zakres kończący się na danym wątku. Oznacza to, że jeśli załadujesz dane w *setUp Thread Group*, nie będą one dostępne dla odpowiednich grup wątków odpowiedzialnych za wywoływanie interfejsów. Oczywiście możesz umieścić w nich właściwą logikę ładowania danych, ale w wielu sytuacjach może to nie być oczekiwane. Na przykład możemy nie chcieć generować żadnego sztucznego obciążenia bazy danych podczas testów. Rozwiązaniem takiego przypadku jest wykorzystanie właściwości (ang. properties) w JMeter. Są one bowiem współdzielone pomiędzy różnymi grupami wątków. Aby zapisać właściwość w wątku setUp, możemy użyć:
- funkcji [__setProperty](https://jmeter.apache.org/usermanual/functions.html#__setProperty);
- Post Procesora/[Samplera JSR223](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler) oraz obiektu typu *props* o typie *JMeterProperties* z interfejsem `java.util.Properties`, pozwalającym na łatwe zapisanie rezultatów zapytań JDBC jako obiektów.

Odczytanie tych właściwości jest możliwe dzięki:
- funkcjom [__P](https://jmeter.apache.org/usermanual/functions.html#__P) oraz [__property](https://jmeter.apache.org/usermanual/functions.html#__property);
- Pre Procesorze/[Samplerze JSR223](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler) i obiekcie *props*.

Właściwości służą również do pobierania parametrów przekazanych w wierszu poleceń z prefiksem `-J`, np. `-Jklucz=wartość`.

#### Losowanie danych wejściowych

Po udostępnieniu danych wejściowych właściwym wątkom za pomocą właściwości możemy wybrać losowo dane niezbędne do wykonania pojedynczego przypadku i zapisać je już jako zmienne. Każdy wątek z tej samej grupy będzie miał wtedy dostęp do różnych wartości z wykorzystaniem składni `${nazwa_zmiennej}`.

```groovy
import java.util.Random; 

Random rand = new Random(); 
def index = rand.nextInt(props.get("resultSet").size());
vars.put("id", props.get("resultSet").get(index).get("USER_ID").toString());
```

Możesz także wziąć pod uwagę inne sposoby generowania liczb losowych. Przeprowadziłem kilka testów wydajności polegających na generowaniu jednej losowej liczby całkowitej (10 wątków x 100000 powtórzeń). Zostały one wykonane w dosyć luźny sposób i służą wyłącznie poglądowemu odniesieniu:

<table class="rwd">
   <thead>
      <tr>
         <th>Generator</th>
         <th>Wydajność [wyw./s]</th>
         <th>Uwagi</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Generator">
            java.util.Random
         </td>
         <td data-label="Wydajność [wyw./s]">
            10900
         </td>
         <td data-label="Uwagi">
            -
         </td>
      </tr>
      <tr>
         <td data-label="Generator">
            java.util.concurrent.ThreadLocalRandom
         </td>
         <td data-label="Wydajność [wyw./s]">
            11377
         </td>
         <td data-label="Uwagi">
            Podobna wydajność jak java.util.Random wskazuje, że generator jest lokalny dla wątku w *Thread Group* (oczywiście nie jest tu sprawdzane jawne wykonanie w puli wątków wewnątrz samego skryptu, gdzie zapewne różnica byłaby zauważalna)
         </td>
      </tr>
      <tr>
         <td data-label="Generator">
            org.apache.commons.lang3.RandomUtils
         </td>
         <td data-label="Wydajność [wyw./s]">
            <span style="color:limegreen">11704</span>
         </td>
         <td data-label="Uwagi">
            Minimalnie najszybszy (1%)
         </td>
      </tr>
      <tr>
         <td data-label="Generator">
            <a href="https://jmeter.apache.org/usermanual/functions.html#__Random">__Random</a>
         </td>
         <td data-label="Wydajność [wyw./s]">
            <span style="color:crimson">5065</span>
         </td>
         <td data-label="Uwagi">
            Najwolniejszy, dwukrotnie
         </td>
      </tr>
    </tbody>
</table>

Jak widać, trzy pierwsze metody są dobrym wyborem. Nie zalecałbym używania *__ Random*, ponieważ wygląda na dosyć powolną z jakiegoś powodu. Mamy jednak do wyboru inne całkiem przydatne funkcje wbudowane w JMetera takie jak [__RandomString](https://jmeter.apache.org/usermanual/functions.html#__RandomString), [__RandomDate](https://jmeter.apache.org/usermanual/functions.html#__RandomDate), [__time](https://jmeter.apache.org/usermanual/functions.html#__time), [](https://jmeter.apache.org/usermanual/functions.html#__UUID) oraz [__threadNum](https://jmeter.apache.org/usermanual/functions.html#__threadNum) do generowania losowych danych testowych. Kod Groovy można również wstawiać poza przystosowanymi do tego elementami za pomocą metody [__groovy](https://jmeter.apache.org/usermanual/functions.html#__groovy).

### Zwiększanie obciążenia

Podczas parametryzacji obciążenia i definiowania docelowej liczby żądań na sekundę warto zanotować niektóre właściwości konfiguracyjne testowanych komponentów. W przypadku bazy danych jest to maksymalna liczba połączeń. W przypadku serwerów jest to liczba równoległych żądań i wielkość kolejki. Najczęściej mnożymy to przez liczbę węzłów (serwerów) równoległych, biorąc pod uwagę pewne koszty ogólne takie jak: rozdzielenie obciążenia, narzut związany z inicjalizacją przypadków testowych oraz połączeniem.

Jak wspomniano wcześniej, zwiększenie obciążenia jest proste i sprowadza się do zwiększenia liczby użytkowników. W zależności od specyfikacji maszyny i złożoności testu będziesz w stanie skonfigurować około 5000 równoległych wątków. W pewnym momencie jednak narzut związany z tworzeniem dodatkowych wątków skutecznie obniży wydajność samych testów. Jeśli masz wysokowydajny system z wieloma węzłami, możesz nie być w stanie wygenerować maksymalnego limitu obciążenia. Zauważ również, że trudno jest oszacować liczbę wywołań interfejsu w czasie na podstawie liczby użytkowników. Domyślnie każdy wątek musi wysłać zapytanie do interfejsu i poczekać na odpowiedź.

<img style="background: white" src="/img/hq/testy-obciazeniowe-klient-serwer-klient.svg" alt="Standardowa komunikacja klient - serwer" title="Standardowa komunikacja klient - serwer">

Ustawiając limit czasu odpowiedzi, możemy skutecznie pominąć oczekiwanie na odpowiedź i znacznie szybciej wysłać kolejne żądanie. Wadą tego rozwiązania jest to, że tracimy możliwość monitorowania odpowiedzi i ich statusów. Jest to realna opcja, jeśli mamy dodatkowe narzędzia do monitorowania obciążenia. Przy ustawieniu naprawdę niskiego limitu czasu odpowiedzi polecam jednak dodanie jednej nieskonfigurowanej (oczekującej na odpowiedź) grupy wątków w celu sprawdzenia statusu. W praktyce możliwe jest bowiem zatrzymanie się na jakiejś nieznanej zaporze/systemie bezpieczeństwa czy też sytuacji, gdy mamy błędną konfigurację połączenia. W takim przypadku możemy stracić cenny czas (szczególnie gdy mamy na testy mamy przeznaczone sztywne okno czasowe), zwłaszcza jeśli narzędzia monitorowania nie wyświetlają danych online.

<img style="background: white" src="/img/hq/testy-obciazeniowe-klient-serwer.svg" alt="Komunikacja klient - serwer z bardzo niskim czasem oczekiwania na odpowiedź" title="Komunikacja klient - serwer z bardzo niskim czasem oczekiwania na odpowiedź">

Ostatnią rzeczą do wzięcia pod uwagę jest połączenie. W sieci lokalnej czas transportu pakietów do serwera jest bardzo krótki. Natomiast, jeśli środowisko docelowe znajduje się w internecie lub jest dostępne tylko przez VPN, testy będą przebiegały wolniej, skutecznie generując mniejsze obciążenia. Ostatecznie jednak to nie czas transportu, a przepustowość jest czynnikiem ograniczającym.

### Podsumowanie

JMeter to całkiem niezłe narzędzie do przeprowadzania testów obciążenia. Samo w sobie nie jest jednak wystarczające i w kompleksowych przypadkach konieczne jest wykorzystanie dodatkowych systemów monitorowania. Aby testy miały jakikolwiek sens, konieczne jest rozważenie bardzo wielu aspektów całego systemu, począwszy od kwestii oprogramowania i komponentów, kończąc na połączeniu i konfiguracji sprzętowej. Każdy punkt powinien być rozpoznany i wzięty pod uwagę podczas fazy przygotowania. Po udanym wykonaniu testów kolejnym krokiem jest analiza wyników i przygotowanie raportów. Jest to etap niezbędny w określeniu przyszłych kroków — optymalizacji bądź zdefiniowania SLA.

Zachęcam także do sprawdzenia przykładowego projektu. Możesz się pobawić testami sprawdzając domyślną konfigurację puli wątków serwera Tomcat, wielkości kolejki, liczebność puli połączeń bazy danych H2 oraz limity czasowe. Tematy takie jak ładowanie danych z pliku CSV / bazy danych, zakres zmiennych i zwiększanie obciążenia również zostały tam uwzględnione.