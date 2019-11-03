---
title: Kategoryzacja testów, tworzenie zestawów i zrównoleglanie
url: kategoryzacja-testów-zestawy-zrównoleglanie
id: 15
tags:
  - testy
  - java
  - android
  - maven
  - gradle
author: Damian Terlecki
date: 2019-10-27T20:00:00
---

Niektórzy zaliczają pisanie testów automatycznych do dosyć nudnych obowiązków. Niemniej jednak wszyscy zgodzą się, że wysokie pokrycie kodu testami może zaowocować nie tylko zaoszczędzonym czasem, ale również spokojnym umysłem. Testy szczególnie doceniane są w przypadku zmian w zespole, gdy nowe osoby, ze względu na wielkość projektu, nie są w stanie od samego początku przewidzieć wszystkich skutków swoich zmian w kodzie.

Wiedząc, jak duże znaczenie mają testy, pochylmy się dzisiaj nad następującym pytaniem. Kiedy i dlaczego warto zacząć kategoryzować swoje testy oraz rozpocząć tworzenie zestawów testów (ang. test suites)?

### Testy wykonują się zbyt długo

Nie stanowi to problemu w przypadku testów jednostkowych. Weźmy więc pod uwagę testy integracyjne. Z pewnością zainicjowanie jakiegoś modułu, usługi lub testowej bazy danych zajmuje więcej czasu niż przetestowanie kilku wydzielonych linii w kodzie. Głównym winowajcą są tutaj jednak testy typu end-to-end oraz testy interfejsu użytkownika. To właśnie one zajmują kilkudziesięciokrotnie więcej czasu na wykonanie.

<img src="/img/hq/piramida-testów.svg" alt="Piramida testowa Mike'a Cohna" title="Piramida testowa Mike'a Cohna">

Twierdzenie, że nie potrzebujemy testów E2E/UI może być poprawne w zależności od typu aplikacji. Na przykład, jeśli testowany system jest jedynie prostą usługą backendową, to problemy tego typu są dosyć znikome. Jeśli natomiast aplikacja składa się w większości z interfejsu użytkownika, sprawa może być inna. Testy jednostkowe i integracyjne są często zbyt niskopoziomowe do przetestowania złożonych ścieżek przepływu danych w systemie. Często ścieżki te są kluczowe i mogą ujawniać pewne niepożądane zachowania. Potrzebne jest spojrzenie na projekt z poziomu przypadków użycia. W przypadku samego interfejsu — sporo czasu zajmuje samo jego załadowanie.

Do zobrazowania tematu posłużę się błędem wykrytym w jednej z moich aplikacji na Androida. Dzięki napisaniu testu UI dla jednego z komponentów, udało mi się wykryć, że z testowanym elementem nie ma w ogóle możliwości interakcji ze względu na jego przysłonięcie przez transparentną nakładkę (a właściwie jej krawędzie) kontrolek przybliżania i oddalania. Znalezienie tego błędu było bardzo satysfakcjonujące z tego względu, że komponent był testowany pod znacznie innym względem.

Głównym powodem, dla którego testy UI i E2E trwają znacznie dłużej, jest to, że na każdym etapie aplikacja musi załadować wszystkie niezbędne zasoby i wyświetlić je użytkownikowi (silnikowi testowemu). Czasami można zaoszczędzić kilka sekund tu i tam, ponownie wykorzystując stan aplikacji z poprzedniego testu. Z drugiej strony zwiększa to złożoność testu. Konieczne jest wtedy wprowadzenie kolejności testów, co utrudnia ich późniejszą weryfikację. Często chcemy więc aby nasze testy były całkowicie izolowane. Ponowne uruchomienie aplikacji bądź załadowanie tego samego interfejsu może zająć sporo czasu.

### Zrównoleglanie

Tematem na dzisiaj jest zrównoleglenie testów. Przyspieszenie fazy testowej jest kluczowym czynnikiem decydującym o tym, jak szybko będziemy w stanie stwierdzić, czy nowa wersja jest stabilna i gotowa do produkcji. Możemy to osiągnąć na dwóch poziomach. Po pierwsze, możemy zmodyfikować zdefiniowane do tego parametry narzędzi do budowania projektu:
- Gradle ma do tego parametr [maxParallelForks](https://docs.gradle.org/current/dsl/org.gradle.api.tasks.testing.Test.html#org.gradle.api.tasks.testing.Test:maxParallelForks) umożliwiający równoległe wykonywanie testów:

```groovy
tasks.withType(Test) {
    maxParallelForks = Runtime.runtime.availableProcessors().intdiv(2) ?: 1
}
```
- w Mavenie [konfiguracja](https://www.baeldung.com/maven-junit-parallel-tests) wtyczek *surefire* i *failsafe* daje nieco większe pole do popisu.

W niektórych przypadkach równoległe testowanie E2E / UI na tym poziomie może być jednak trudne, na przykład w Androidzie, gdzie możemy wykonać tylko jeden test na raz (bez dodatkowych narzędzi) na jednym urządzeniu. Tak więc drugą opcją jest utworzenie osobnych zestawów testów i ich kategoryzacja. Utworzone w ten sposób grupy możemy następnie uruchomić na kolejnych instancjach emulatora.

W tym przypadku możemy upiec dwie pieczenie przy jednym ogniu. Jesteśmy w stanie nie tylko przyspieszyć fazę testowania, ale także skategoryzować przypadki testowe według priorytetu lub według ich czasami niedeterministycznych wyników. Dzięki temu weryfikacja krytyczności funkcjonalności, której dotyczy nieudany test, jest bardzo szybka. Niektóre bardziej złożone testy mogą dawać niedeterministyczne wyniki i być może powinniśmy je poprawić/powtórzyć (w 2016 [Google informowało, że 1 na 7 testów](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) czasami kończyło się niepowodzeniem z powodów niezwiązanych ze zmianami w kodzie). W ten sam sposób możęmy pogrupować również testy błędów, które jeszcze nie zostały naprawione.

Wracając do tematu, z tej drugiej opcji możemy skorzystać właśnie na serwerach do integracji oraz automatyzacji zadań. Nie będę zagłębiał się tutaj w szczegóły konfiguracji, gdyż są one specyficzne dla różnych rozwiązań. Jeśli interesuje Cię więcej informacji na ten temat, warto sięgnąć do dokumentacji i poczytać o:
- [etapach równoległych w Jenkinsie](https://jenkins.io/doc/book/pipeline/syntax/#parallel);
- [macierzy buildów w Travisie](https://docs.travis-ci.com/user/build-matrix/) oraz [zadaniach równoległych](https://docs.travis-ci.com/user/speeding-up-the-build/);
- [zrównolegleniu w CircleCI](https://circleci.com/docs/2.0/parallelism-faster-jobs/).

W ten sposób możesz równolegle uruchomić skategoryzowane testy. Zobaczmy teraz, jak stworzyć zestawy testów i skonfigurować narzędzie do budowania (Maven/Gradle) do ich uruchomienia. Skoncentruję się głównie na Androidzie i Javie (JUnit 4), gdyż miałem z nimi najwięcej do czynienia. Te same pojęcia z pewnością znajdziesz również w innych językach i narzędziach.

<img src="/img/hq/PBMap-travis.png" alt="Zrównoleglony build" title="Zrównoleglony build">

### Android

Android ma tę wspaniałą listę bibliotek testowych *AndroidX*. Wystarczy dodać `testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"` do `defaultConfig` w `build.gradle` na poziomie modułu aplikacyjnego (standardowo `app`). Ta klasa służy do uruchamiania testów JUnit3 i JUnit4 na aplikacji Androidowej (z tego co wiem, nie ma jeszcze oficjalnej obsługi JUnit5, ale znajdziemy [rozwiązania](https://github.com/mannodermaus/android-junit5) stworzone przez samą społeczność skupioną wokół Androida). Przedstawiony runner obsługuje kilka przydatnych parametrów. Domyślne jego użycie polega na uruchomieniu `./gradlew connectedAndroidTest`. Aha, i oczywiście przed tym musimy załadować zależności:

```groovy
androidTestImplementation "androidx.test:core:1.2.0"
androidTestImplementation "androidx.test:runner:1.2.0"
androidTestImplementation "androidx.test.ext:junit:1.1.1"
```

Zanim spojrzymy na parametry runnera, wspomnę jeszcze o kolejnej fajnej części pakietu testowego *AndroidX*. Jest to funkcjonalność filtrowania. Standardowo paczka zawiera kilka użytecznych adnotacji, takich jak `@SmallTest`, `@MediumTest` i `@LargeTest`. Zalecaną praktyką jest tworzenie i kategoryzowanie testów zgodnie z konwencją [piramidy testowej](https://developer.android.com/training/testing/fundamentals#write-tests). Krótkie testy jednostkowe opatrzone adnotacją `@SmallTest` powinny być najliczniejsze i stanowić 70% testów. Następnie powinniśmy skoncentrować się na testach integracyjnych (20%) i opatrzyć je adnotacjami `@MediumTest`. Na koniec do grupy `@LargeTest` warto zaliczyć kompleksowe testy wielomodułowe.

Do poprawnego uruchomienia testów konieczne będzie jeszcze dodanie adnotacji `@RunWith (AndroidJUnit4.class)` do klasy testowej. Każdy test powinien również zawierać, oprócz kategorii, podstawową adnotację testu `@Test`. Jeśli w tym miejscu zastanawiasz się, jaka jest różnica między klasami *AndroidJUnitRunner*, a *AndroidJUnit4* to postaram się to zobrazować w prosty sposób. Pierwsza klasa to tzw. *instrumentation runner* (instrumentacja/orkiestracja/współdziałanie) służący do załadowania zarówno testu, jak i aplikacji na urządzeniu, uruchomienie testu oraz zwrócenie wyników. W zasadzie jest ona odpowiedzialna za środowisko testowe. Ta druga to w skrócie *test runner*, do którego przekazywana jest kontrola nad poszczególnymi testami zdefiniowanymi w klasie. Android w swoim pakiecie narzędzi zapewnia również właściwą funkcjonalność orkiestracji. Aby nie wybiegać zbyt daleko poza ramy tematu, nadmienię w skrócie, że pozwala ona na zarządzanie izolacją testów. Jest to przydatne do czyszczenia wspólnego stanu pamięci oraz wydzielania testów, które mogą crashować cały kontekst instrumentacji. Warto o tym pamiętać na wypadek, w przypadku napotkania takiego problemu w przyszłości.

Znając już możliwości filtrowania oraz zdając sobie sprawę z istnienia modułów, możemy sparametryzować naszego runnera na różne sposoby. Zaczynając od podstaw:
- `./gradlew test` - wywołuje testy jednostkowe na całym projekcie;
- `./gradlew connectedAndroidTest` - wywołuje testy instrumentacyjne na całym projekcie;
- `./gradlew app:connectedAndroidTest` - wywołuje testy instrumentacyjne na module *app*;
- `./gradlew app:testDebug --tests=&lt;package.class&gt;` - wywołuje testy jednostkowe z danej klasy modułu *app* i wariantu *Debug*;
- `./gradlew app:connectedVariantNameAndroidTest` -  wywołuje testy instrumentacyjne na module *app* oraz wariancie *VariantName* np. *Debug*;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=[small|medium|large]` - wywołanie testów z wybraną adnotacją `@SmallTest`, `@MediumTest` bądź `@LargeTest`;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=small,medium` - wywołanie testów z adnotacją `@SmallTest` bądź `@MediumTest`;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest` - zignorowanie testów adnotowanych `@FlakyTest`;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.package=&lt;package&gt;` - tylko z wybranego pakietu;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=&lt;package.class&gt;` - tylko z wybranej klasy (np. zestaw testowy).

Jeśli chcesz być bardziej hardcore, mozesz spróbować [wywoływania testów przez adb](https://developer.android.com/studio/test/command-line#RunTestsDevice). Nie jest to jednak koniec miłych rzeczy. Dzięki JUnit4 możemy również grupować testy w zestawy:

```java
package io.github.t3r1jj.pbmap.main;

import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({MapActivitySearchIT.class, ControllerMementoIT.class})
public class ITTestSuite {}
```
Przy takiej konfiguracji cały zestaw możemy wykonać, przekazując klasę jako parametr runnera `android.testInstrumentationRunnerArguments.class = io.github.t3r1jj.pbmap.main.ITTestSuite`. Ten sposób pozwala nam to stworzyć wiele różnych konfiguracji testowych. Chcesz przetestować tylko podstawowe funkcje, przeprowadzić długotrwałe testy, pogrupować je w równej wielkości zestawy — nie ma problemu.

### Java

Jeśli popatrzymy na standardową Javę, mechanizm kategoryzacji jest praktycznie taki sam. Tym razem spojrzymy na sytuację z poziomu Mavena.
Do stworzenia odpowiednika *@Small/@Medium/@LargeTest* posłuży nam adnotacja `org.junit.experimental.categories.Category` z pakietu JUnit4.
Jako wartość przykładowej kategorii możemy użyć dowolnej klasy/interfejsu, np.:

```java
package io.github.t3rmian.jmetersamples;

import org.junit.Test;
import org.junit.experimental.categories.Category;

public class JMeterSamplesApplicationTests {

	@Category(SmallTest.class)
	@Test
	public void categorizedTest() {
	}

	@Test
	public void defaultTest() {
	}

}
```

```java
package io.github.t3rmian.jmetersamples;

public interface SmallTest {
}
```
Ok, dodaliśmy kategorie do naszych testów, ale w jaki sposób teraz wywołać jedynie małe testy?. Wymaga to pewnej praktycznej wiedzy na temat Mavena, ale na pewno łatwo podłapiesz temat. Po pierwsze, do testów integracyjnych użyjemy wtyczki `maven-failafe-plugin`, do testów jednostkowych z kolei przygotowano `maven-surefire-plugin`. Wspomnianą wtyczkę należy dodać do konfiguracji budowania projektu:
```xml
&lt;build&gt;
	&lt;plugins&gt;
		&lt;plugin&gt;
			&lt;groupId&gt;org.apache.maven.plugins&lt;/groupId&gt;
			&lt;artifactId&gt;maven-failsafe-plugin&lt;/artifactId&gt;
			&lt;version&gt;2.22.2&lt;/version&gt;
			&lt;configuration&gt;
				&lt;groups&gt;${test.groups}&lt;/groups&gt;
			&lt;/configuration&gt;
		&lt;/plugin&gt;
	&lt;/plugins&gt;
&lt;/build&gt;
```

Jest tu kilka rzeczy, o których warto wspomnieć. Najnowsze wersje wtyczki mają wsparcie dla kategorii JUnit4 (*junit47 provider*).
Konkretne grupy definiujemy następnie w konfiguracji. Aby zainicjalizować tę właściwość (ang. property), użyjemy do tego celu profili Mavenowych.
Wystarczy, że w ramach projektu zdefiniujemy profil odpowiadający kategorii testów, które chcemy wykonać:

```xml
&lt;profiles&gt;
	&lt;profile&gt;
		&lt;id&gt;SmallTest&lt;/id&gt;
		&lt;properties&gt;
			&lt;test.groups&gt;io.github.t3rmian.jmetersamples.SmallTest&lt;/test.groups&gt;
		&lt;/properties&gt;
	&lt;/profile&gt;
&lt;/profiles&gt;
```

Dzięki takiej konfiguracji testy można uruchomić, wykonując fazę weryfikacji z naszym profilem: `mvnw Verify -P SmallTest`.
Nie tak łatwe, jak w przypadku Androida, ale nie jest zbyt skomplikowane, prawda? Zestawy testowe są tworzone w ten sam sposób. Dodatkowo możliwe jest użycie `@Categories.IncludeCategory(SmallTest.class)` w klasie zestawu testów, aby uwzględnić tylko wybrane testy. W podobny sposób możemy skorzystać z opcji wykluczenia kategorii.

Aby wykonanie testów ograniczyć do wybranych modułów, wystarczy wywołać testy z przygotowanym do tego celu parametrem `-pl` lub `--projects` (`mvnw -help` zwróci Ci więcej informacji na ten temat). W celu uruchomienia konkretnego zestawu testów należy go przekazać jako parametr systemowy `mvnw -Dit.test=SpecificTestSuite verify`. Dla wtyczki `maven-surefire-plugin` będzie to `mvnw -Dtest=SpecificTestSuite test`.

### Podsumowanie

I to właściwie tyle! Jak widać, grupowanie i kategoryzacja testów nie są zbyt skomplikowane, a mogą one później zaoszczędzić sporo czasu. Jeśli jeszcze nie używasz równoległego wykonywania testów z kategoryzacją i zestawami testowymi, to zachęcam do spróbowania. Zwłaszcza jeśli Twoje testy koncentrują się głównie na interfejsie użytkownika i zajmują dużo czasu. Skrócenie fazy testowej może przyspieszyć proces dostarczenia kolejnej wersji systemu. Zaowocuje to w przypadku, gdy aplikacja będzie wymagała jak najszybszego wydania np. w przypadku krytycznego błędu.