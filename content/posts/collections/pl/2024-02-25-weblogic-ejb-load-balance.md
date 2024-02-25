---
title: WebLogic EJB i równoważenie obciążenia
url: weblogic-ejb-równoważenie-obciążenia
id: 125
category:
  - jee: JEE
tags:
  - weblogic
  - wydajność
author: Damian Terlecki
date: 2024-02-25T20:00:00
---

Równoważenia obciążenia przy dostępie do interfejsów `@Remote` `@EJB` w WebLogic
zaimplementowane zostało dosyć optymalnie.
W tej kwestii można jednak zadać sobie kilka pytań, których zrozumienie będzie miało wpływ na poprawną implementację skalowalnych procesów.
Czy zdalne interfejsy zawsze podlegają równoważeniu obciążenia, czy zależy to od sytuacji bądź konfiguracji? Jakie mamy dostępne opcje?
Czy po stronie klienta możemy dowiedzieć się, który węzeł klastra przetworzył żądanie?

## Charakterystyka równoważenia obciążenia dla bezstanowych zdalnych interfejsów EJB

Aby odpowiedzieć na te pytania, zapoznajmy się najpierw z [dokumentacją WebLogic 14.1.1.0](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/clust/load_balancing.html#GUID-2470EEE9-F6F9-44EF-BA54-671728E93DE6)
(podobnie wygląda to również w starszych wersjach).
Opisuje ona funkcjonalność równoważenia obciążenia dla bezstanowych zdalnych interfejsów EJB.
Warto tu mieć na uwadze dwa rodzaje połączeń:
- klient-serwer;
- serwer-serwer.

Połączenia i wywołania klient-serwer są równoważone pod względem obciążenia przy użyciu jednej z trzech strategii:
domyślnej – algorytmu karuzelowego (round-robin), opartej na wadze poszczególnych serwerów lub strategii losowej.
Alternatywnie równoważenie obciążenia można wyłączyć na
rzecz tzw. powinowactwa serwera/połączenia tj. wywołania będą kierowane do serwera, z którym w pierwszej kolejności ustanowiliśmy połączenie.

Przy "powinowactwie" nadal mamy do czynienia z równoważeniem obciążenia, ale tylko wtedy, gdy
zamiast serwera zarządzanego używasz identyfikatora URI klastra i tylko na poziomie tworzenia nowego kontekstu (*InitialContext*).
Wszystkie te opcje obsługują przełączanie awaryjne w przypadku gdy klient nie jest w stanie połączyć się z ostatnio wybranym serwerem.

<img src="/img/hq/weblogic-cluster-load-balancing.svg" title="Równoważenie obciążenia interfejsów zdalnych EJB na serwerze WebLogic (uproszczone)" alt="Diagram równoważenia obciążenia interfejsów zdalnych EJB na serwerze WebLogic (uproszczone)">

W przypadku połączeń serwer-serwer należy pamiętać, że opcja powinowactwa nie wpływa na równoważenie obciążenia
między serwerami. Co więcej, w ramach jednego klastra, WLS zawsze będzie korzystał z komponentu EJB znajdującego się
na tym samym serwerze, który odebrał żądanie (jest to znacznie wydajniejsze). Tak zwana kolokacja obiektów powoduje,
że użycie interfejsów `@Remote` w ramach `@EJB` jest w tym przypadku nieoptymalna (niepotrzebna serializacja).
Podobne zachowanie opisano w przypadku obsługi żądań w kontekście `UserTransaction` i opcjonalnie dla XA.

Równoważenie obciążenia występuje natomiast pomiędzy oddzielnymi klastrami, np. w konfiguracji klastrów per-warstwa w wielowarstwowej konfiguracji aplikacji internetowej.
Jeśli nie chcesz kolokacji, alternatywną opcją przetwarzania są kolejka JMS z opcją równoważenia obciążenia.

## Ustalanie, który serwer obsłużył moje żądanie (klienta)

Czasami warto wiedzieć, które serwery obsłużyły określone żądania.
Przykładowo miałem okazję spotkać się ze zdesynchronizowanym wdrożeniem nowej wersji aplikacji w klastrze, powodujące otrzymywanie różnych odpowiedzi z dwóch wersji aplikacji.
Dzięki informacji o właściwym serwerze rozwiązanie problemu udało się uprościć do ponownego wdrożenia na pojedynczym serwerze zamiast całego klastra.

Informacja taka może być dostępna w logach aplikacyjnych pod warunkiem jej implementacji.
Czy jest coś, czego moglibyśmy użyć ad hoc?
Jeśli kojarzysz WLS, być może już wiesz, że takie informacje mogą być obecne
gdzieś w obiektach biblioteki [`wlthint3client.jar`](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/wlthint3client.html#GUID-4EB44FDC-51E6-43B0-8963-D1101238CAD9).
Służy ona bowiem do łączenia się z WLS i zawiera logikę równoważenia obciążenia dla protokołu *t3*.

Jednakże jest w tym coś więcej. Do równoważenia obciążenia można użyć specjalnego *loggera*.
Bez tego musielibyśmy polegać na implementacji niestandardowej logiki wokół wywołań EJB, która sięgałaby do stanu wewnętrznego *stuba* (lokalnej referencji) zdalnego obiektu EJB.

<img src="/img/hq/weblogic-remote-ejb-stub-cluster-ref.png" title='Ewaluacja nazwy serwera, który przetworzył ostatnie wywołanie EJB "myRemoteRef" w IntelliJ' alt="Zrzut ekranu ewaluacja nazwy serwera, który przetworzył ostatnie wywołanie EJB w IntelliJ">

Logowanie biblioteki *Wlthint3client* wykorzystuje wewnątrz JUL (Java Util Logging). Aby zintegrować logowanie z innym produktem, poszukaj mostu takiego jak `jul-to-slf4j` w przypadku SL4J.
Aby włączyć logowanie, uruchom aplikację z parametrem JVM `-Dweblogic.debug.DebugLoadBalancing` lub wykonaj to programowo dla współdzielonego *loggera*:

<img src="/img/hq/weblogic-debug-load-balancing.png" title="WebLogic DebugLoadBalancing debugger" alt="WebLogic DebugLoadBalancing debugger">

```java
weblogic.diagnostics.debug.DebugLogger
        .getDebugLogger("DebugLoadBalancing")
        .setDebugEnabled(false);
```

Następnie wystarczy, że skonfigurujesz poziom rejestrowania i wypisywanie (na konsolę/do pliku) zgodnie ze swoim frameworkiem.
W tym miejscu `displayName` to nazwa *loggera* z usuniętym przedrostkiem `Debug`. Tym samym finalna nazwa *loggera* JUL zmieni się na `LoadBalancing`.
Przy odpowiedniej konfiguracji możesz spodziewać się wpisów w dzienniku takich jak poniżej:

```plaintext
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1 to 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2 to 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3 to 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1
```

W połączeniu z nazwą wątku i czasem (konfigurowalne za pomocą formatu logowania) lub innymi informacjami kontekstowymi informacje te pozwolą Ci na powiązanie każdego żądania z konkretnym procesem biznesowym i serwerem EJB.
Innymi przydatnymi *loggerami* są `DebugFailOver` (przełączenie awaryjne) i, nieco mniej, `DebugMessaging`. Ten ostatni działa głównie przy dodatkowej fladze `-Dweblogic.kernel.debug=true` i
wypisuje zawartość wiadomości na konsolę w ładnym formacie bajtowym.
