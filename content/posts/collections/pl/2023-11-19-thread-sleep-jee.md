---
title: Thread.sleep() a JEE
url: thread-sleep-jee
id: 120
category:
  - jee: JEE
tags:
  - wątki
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

O ile prostota metody `Thread.sleep()` pozwala na szybkie i łatwe wytworzenie sztucznego opóźnienia, to
szczególnie [w środowisku JEE wykorzystanie jej nie jest zalecane](https://www.oracle.com/java/technologies/restriction.html#threads).
Wchodzi ona na grząski grunt zarządzania wątkami, które to powinno być obsługiwane przez kontener serwera aplikacji.
Ta
ingerencja może zakłócić zdolność kontenera do optymalizacji przydzielania zasobów i zarządzania wątkami, co prowadzi do
degradacji wydajności i potencjalnych wąskich gardeł. W scenariuszach o dużym ruchu kontenerowi może zabraknąć wolnych
wątków bądź połączenia ze źródłem danych, co może skutkować opóźnieniami lub awariami w obsłudze zapytań.

## Timer Service

Zgodną z JEE alternatywą dla `Thread.sleep` jest `TimerService`.
To zestaw interfejsów, który umożliwia programistom planowanie zadań do wykonania
z danym opóźnieniem lub w określonych interwałach.

<img src="/img/hq/thread-sleep-jee.png" alt="Prezentacja wyników w konsoli uruchomienia przykładu obrazującego wykorzystanie TimerService jako alternatywy dla Thread.sleep() w JEE" title="Wyjście konsoli zapisującej wyniki zadania wykonanego z opóźnieniem przy użyciu TimerService">

Aby skorzystać z tej usługi, należy wstrzyknąć zasób kontenera w postaci `TimerService` do EJB. Następnie przy użyciu
metody `createTimer()` utworzyć odliczanie do wywołania swego rodzaju przerwania. Wreszcie, metoda oznaczona
adnotacją `@Timeout` powinna zawierać implementację właściwego procesu, który ma zostać uruchomiony po określonej przerwie.

Podczas wywoływania metody `createTimer()` możesz podać parametr typu `Serializable`.
Kontener udostępni jego dane w metodzie oznaczonej adnotacją `@Timeout`, przy wywołaniu `getInfo()` na argumencie typu `Timer`.
W ten sposób można przekazać postępu prac bądź definicję zadania (np. wzorcem projektowym "Polecenie").

Oto przykład wywołania metod `foo()` i `bar()` z opóźnieniem 5 sekund pomiędzy nimi:

```java
import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.ejb.Timeout;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Stateless
public class MyEJB {
    public static class MyTimerInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private final LocalDateTime startDateTime;
        private final LocalDateTime fooEndDateTime;

        public MyTimerInfo(LocalDateTime startDateTime, LocalDateTime fooEndDate) {
            this.startDateTime = startDateTime;
            this.fooEndDateTime = fooEndDate;
        }
    }

    @Resource
    private TimerService timerService;

    public void runFooBar() {
        LocalDateTime workStartDate = LocalDateTime.now();
        System.out.println("Starting foo() at " + workStartDate);
        foo();
        LocalDateTime fooEndDate = LocalDateTime.now();
        System.out.println("Ended foo() at " + fooEndDate);
        long delay = TimeUnit.SECONDS.toMillis(5);
        timerService.createTimer(delay, new MyTimerInfo(workStartDate, fooEndDate));
    }

    @Timeout
    public void onTimeout(Timer timer) {
        if (timer.getInfo() instanceof MyTimerInfo) {
            MyTimerInfo myTimerInfo = (MyTimerInfo) timer.getInfo();
            LocalDateTime barStartDateTime = LocalDateTime.now();
            System.out.println("Starting bar() at " + barStartDateTime);
            bar(myTimerInfo);
            LocalDateTime workEndDateTime = LocalDateTime.now();
            System.out.println("Ended bar() at " + workEndDateTime);
            System.out.printf("Total time for foo[%sms] + delay[%sms] + bar[%sms] = %sms%n",
                    Duration.between(myTimerInfo.startDateTime, myTimerInfo.fooEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.fooEndDateTime, barStartDateTime).toMillis(),
                    Duration.between(barStartDateTime, workEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.startDateTime, workEndDateTime).toMillis());
        } else {
            System.err.println("Unknown timer config");
        }
    }

    public void foo() {/***/} // This could return tracking id

    public void bar(MyTimerInfo workProgress) {/***/}
}
```

Oprócz generycznej metody `createTimer()` istnieje więcej metod, takich jak `createSingleActionTimer()`, `createIntervalTimer()` i `createCalendarTimer`.
Ich interfejsy oczekuje parametru `Serializable` opcjonalnie opakowanego w obiekt `TimerConfig`, który
umożliwia zmianę opcji `persistent` (domyślnie `true`). Parametr ten pozwala na wydłużenie czasu życia *timera* poza bieżącą
instancję JVM.

W przypadku metod z adnotacją `@Timeout` istnieją dwa istotne ograniczenia:
> Specyfikacja EJB umożliwia określenie dla tej metody jedynie atrybutów transakcji `RequiresNew` (domyślnie) lub `NotSupported`.

> Metoda nie może deklarować możliwości wyrzucenia wyjątków aplikacyjnych.

Dodatkowo wywołanie takiej metody nie zawsze integruje się w pełni ze wszystkimi funkcjonalnościami kontenera.
Przykładowo na serwerze WebLogic interceptory nie są aplikowane przy bezpośrednim jej wywołaniu przez kontener.
Przy implementacji warto więc zwracać uwagę na tego typu funkcjonalności również w przypadku innych kontenerów.

## Podsumowanie

Zgodną z JEE alternatywą dla `Thread.sleep` może być użycie wstrzykniętego zasobu `TimerService` i metody `@Timeout`. 
Usługa ta wymaga jednak podzielenia kodu na co najmniej dwie
części, co jest trudniejsze, im głębiej znajdujemy się w hierarchii wywołań i im bardziej atomiczny musi być proces.

Asynchroniczny charakter może dodatkowo wymagać innego przepływu komunikacji. Jeśli na wynik takiej operacji czeka użytkownik,
należy pomyśleć o mechanizmie informacji zwrotnej (np. podać identyfikator śledzenia).

Ze względu na złożoność optymalne jest porównanie ryzyka negatywnego wpływu `Thread.sleep` na zarządzanie zasobami
kontenera w scenariuszach o dużym natężeniu ruchu z dodatkowymi wymaganiami modelu asynchronicznego.
Koniec końców dobrze jest mieć dobry szkielet dla tego typu procesów (redukcja złożoności poznawczej, wydzielenie odpowiedzialności).