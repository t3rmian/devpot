---
title: JMeter - wprowadzenie
url: jmeter-wprowadzenie
id: 4
tags:
  - jmeter
  - testy
author: Damian Terlecki
date: 2019-06-02T20:00:00
---

JMeter to otwartoźródłowe narzędzie napisane w Javie, dosyć często używane do testów wydajnościowych w celu weryfikacji zachowania systemu pod wpływem obciążenia. Pomimo tego, że testy wydajnościowe są niewątpliwie jednym z głównych zastosowań tego narzędzia, to pozwala ono na przeprowadzanie większości testów z fazy testów systemowych:
- testy funkcjonalne;
- testy wydajnościowe;
- testy obciążeniowe i stabilności;
- testy skalowalności.

<img style="background: white" src="/img/hq/testy-systemowe.png" alt="Rodzaje testów" title="Typy testów">

Testy systemowe przeprowadzane są po fazie testów integracyjnych, a przed fazą testów akceptacyjnych. Są one zazwyczaj ostatnim krokiem wykonywanym przez zespół deweloperski/testerski. Można się spierać, czy na pewno potrzebujemy oddzielnego narzędzia do testów systemowych. Nie ma przecież przeszkód, aby testy takie zaimplementować naszym ulubionym frameworku, na poziomie testów integracyjnych — przy zintegrowanych wszystkich modułach. O ile takie rozwiązanie sprawdzi się w wielu przypadkach, to jest drugie tyle sytuacji, gdzie podejście to nie będzie takie łatwe i szybkie.

W tym miejscu błyszczy właśnie JMeter — narzędzie specjalnie przygotowane do tego typu testów. Po pierwsze, umożliwia ono zdefiniowanie oczekiwanej liczby użytkowników (wątków) w bardzo prosty sposób. W tym celu klikamy PPM na *Test Plan* i wybieramy opcję z listy *Add*. Narzędzie pozwala również na bardziej zaawansowane konfiguracje — definiowanie opóźnień, okresów rozruchu bądź jakie akcje podjąć w przypadku, gdy sampler (coś na wzór pojedynczego testu) zwróci błąd. Dla każdego wątku mamy do wyboru kilka typów samplerów:
- **HTTP Sampler — imituje wizytę użytkownika na stronie, pozwala na testowanie REST-owych bądź SOAP-owych web serwisów;**
- **JDBC Sampler — łączy się z bazą danych i umożliwia weryfikację danych bądź wywołanie zapytań DML (wymaga elementu *JDBC Connection Configuration*);**
- JSR223 Sampler — wykorzystuje skrypty (Groovy/BeanShell/JavaScript/…) dla platformy Java;
- Samplery SMTP oraz Mail Reader — testują serwery SMTP i pozwalają na weryfikację czy dostarczony został e-mail;
- Samplery JMS;
- TCP Sampler;
- FTP Request;
- JUnit Request;
- …

W celu weryfikacji każdemu samplerowi można przypisać (PPM->*Add*) różne typu asercji:
- Response Assertion — standardowy typ asercji pozwalajacy na weryfikację odpowiedzi (nagłówki/ciało/status) wspierający RegExa;
- JSON Assertion — weryfikuje odpowiedź w formacie JSON przy wykorzystaniu JSON Path oraz opcjonalnie RegExa;
- JSR223 Assertion — wykorzystuje język skryptowy w celu weryfikacji;
- XPath Assertion — odpowiednik JSON Path dla XML-a;
- …

Dla przejrzystości proste przypadki testowe powinny wykorzystywać asercje, które można wyklikać z poziomu interfejsu użytkownika. W przypadku bardziej złożonych problemów deweloperzy będą najbardziej efektywni wykorzystując asercje JSR223 (pomijając nieporęczność narzędzia i ograniczone możliwości debugowania). W pozostałych przypadkach polecam odpowiednie budowanie testów z pomocą *Logic Controllerów* (if/while/for) oraz *Post Procesorów* (*Extractors*). *Pre* i *Post Procesory* służą do wykonywania logiki odpowiednio przed i po wykonaniu samplera.

Pozostałe rzeczy dostępne standardowo w JMeterze to *Timery*, *Config Elements* oraz *Listenery*. Te pierwsze pozwalają na całkiem proste zarządzanie czasem — wstrzymywanie wątków, grupowanie bądź opóźnianie ich w celu uzyskania oczekiwanej (dla testów) przepustowości. Elementy konfiguracji umożliwiają definiowanie parametrów, liczników oraz standardowych wartości niektórych samplerów i połączeń. Listenery służą najczęściej do wizualizacji rezultatów testów.

Na koniec, kilka rzeczy, które na pewno Ci się przydadzą w podczas tworzenia testów w JMeterze:
- Debug Samplery oraz Debug Post Procesory — to główne elementy zapewniające logowanie wejścia i wyjścia samplerów wraz ze zmiennymi;
- View Results Tree (*Listener*) — pozwala na wyświetlenie rezultatów testów wraz z logami;
- Summary bądź Aggregate Report (*Listeners*) — wyświetlanie statystyk testów wydajnościowych;
- User Parameters (*Pre Procesor*) bądź User Defined Variables (*Config Element*) — używane w celu definiowania parametrów (składnia `${nazwa_parametru}` pozwala na odniesienie się do wartości parametru) bądź zmiennych.

W razie zapotrzebowania na bardziej zaawansowane funkcjonalności warto przejrzeć [listę niestandardowych wtyczek](https://jmeter-plugins.org/) bądź [napisać własne rozszerzenie](https://jmeter.apache.org/usermanual/jmeter_tutorial.html). Testy napisane w JMeterze mogą być wywoływane ręcznie bądź skonfigurowane w wybranym narzędziu do automatyzacji/integracji (CI) w celu ich automatycznego przeprowadzania. Takie podejście pozwala na nieco inny sposób weryfikacji spójności działania systemu/aplikacji na różnych środowiskach i różnych parametrach konfiguracyjnych.