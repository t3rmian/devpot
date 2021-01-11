---
title: Niestabilne testy w procesie CI/CD
url: analiza-testów-niedeterministycznych
id: 18
tags:
  - java
  - android
  - testy
author: Damian Terlecki
date: 2019-12-08T20:00:00
---

Idąc w górę hierarchii testów, często napotykamy, na problem testów niestabilnych (ang. flaky tests). Określenie _flaky_, popularne w literaturze angielskiej oznacza, sytuację, w której test tej samej części kodu zwraca różne rezultaty (czasami kończy się niepowodzeniem, mimo braku zmian w kodzie). Ze względu na to, że testy na wyższym poziomie są na ogół większe, wymagają więcej zasobów i sprawdzają integrację z wieloma komponentami, to właśnie tej kategorii testów najczęściej dotyczy problem niestabilności. Testy te mogą obejmować pewną komunikację sieciową, mogą ładować duże dane, część z nich może działać w tle, a kolejność synchronizacji może być nie zawsze deterministyczna. W innych przypadkach wskazują one na problemy z wydajnością, bądź z konfiguracją środowiska, ostatecznie, mogą po prostu sprowadzać się do niepoprawnych założeń podczas implementacji testu.

## Statystyka

Wraz ze wzrostem liczby testów integracyjnych, UI, sieciowych i współbieżności wzrastają szanse na niepowodzenie integracyjnego procesu budowania (CI). Wyobraź sobie, że 10% twoich testów charakteryzuje się niestabilnością, np.: każdy z nich kończy się niepowodzeniem raz na 1000 przebiegów. 1 na 1000, czyli 0,1%! Nie brzmi to tak źle, prawda? Teraz wyobraź sobie, że mamy 1000 testów, nie za mało, nie za dużo. Zatem dla 100 testów, które są w tym sensie niedeterministyczne, skumulowane prawdopodobieństwo niepowodzenia weryfikacji wyniesie:

<img src="/img/hq/flaky-tests-probability-failed-test.gif" alt="P(FAILED_TEST) = 1/1000" class="img-formula">
<img src="/img/hq/flaky-tests-probability-failed-build.gif" alt="P(SUCCESSFUL_TEST) = P(\Omega) - 1/1000 = 999/1000" class="img-formula">
<img src="/img/hq/flaky-tests-probability-successful-test.gif" alt="P(SUCCESSFUL_BUILD) = P(SUCCESSFUL_TEST_1) ∩ P(SUCCESSFUL_TEST_2) ∩ P(SUCCESSFUL_TEST_3)  ∩  ...  ∩ P(SUCCESSFUL_TEST_N) = (999/1000)^100 ≈ 90%" title="P(SUCCESSFUL_BUILD) = P(SUCCESSFUL_TEST_1) ∩ P(SUCCESSFUL_TEST_2) ∩ P(SUCCESSFUL_TEST_3)  ∩  ...  ∩ P(SUCCESSFUL_TEST_N) = (999/1000)^100 ≈ 90%" class="img-formula">
<img src="/img/hq/flaky-tests-probability-successful-build.gif" alt="P(FAILED_BUILD) = P(\Omega) - P(SUCCESSFUL_BUILD) = 10%" class="img-formula">

Ok, to zaczyna brzmieć już jak **problem**. Statystycznie co dziesiąty proces zakończy się niepowodzeniem, pomimo praktycznie 100%-owej szansy na powodzenie każdego testu. Proces będziemy musieli analizować, często dochodząc do wniosku, że zarówno test, jak i kod wyglądają poprawnie, a na rezultat miał wpływ jakiś czynnik zewnętrzny. Jednak, aby zobaczyć ogólny obraz prawdopodobieństwa niepowodzenia weryfikacji, warto przeanalizować szerszy zakres parametrów:

<center>
<table>
<thead>
    <tr>
        <th class="corner-header">🠇 Liczba testów \<br/>Prawdopodobieństwo niepowodzenia testu 🠆</th>
        <th>1 / 100 000</th>
        <th>1 / 10 000</th>
        <th>1 / 1 000</th>
        <th>1 / 100</th>
        <th>1 / 10</th>
    </tr>
</thead>
<tbody>
 <tr><td class="th">1</td><td>0%</td><td>0%</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td></tr>
 <tr><td class="th">10</td><td>0%</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td><td class="err">65%</td></tr>
 <tr><td class="th">50</td><td>0%</td><td>0%</td><td class="err">5%</td><td class="err">39%</td><td class="err">99%</td></tr>
 <tr><td class="th">100</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td><td class="err">63%</td><td class="err">100%</td></tr>
 <tr><td class="th">250</td><td>0%</td><td class="warn">2%</td><td class="err">22%</td><td class="err">92%</td><td class="err">100%</td></tr>
 <tr><td class="th">500</td><td>0%</td><td class="err">5%</td><td class="err">39%</td><td class="err">99%</td><td class="err">100%</td></tr>
 <tr><td class="th">1000</td><td class="warn">1%</td><td class="err">10%</td><td class="err">63%</td><td class="err">100%</td><td class="err">100%</td></tr>
 <tr><td class="th">2000</td><td class="warn">2%</td><td class="err">18%</td><td class="err">86%</td><td class="err">100%</td><td class="err">100%</td></tr>
</tbody>
</table>
<b>Szansa niepowodzenia procesu weryfikacji w procesie CI/CD</b>
</center>

Przeglądając tabelkę, z łatwością odkryjemy sytuacje, w których spędzimy więcej czasu sprawdzając, dlaczego, kompilacja się nie powiodła, niż robiąc coś produktywnego. Oczywiście czasami możemy zaadaptować test do pewnych warunków, ale w wielu przypadkach nie przewidzimy wszystkiego, a nasz wpływ na samo środowisko może być minimalny. Inną opcją jest usunięcie testu lub zignorowanie jego wyników, jednakże często stanowią one wartość dodaną i dostarczają nam **dodatkowych informacji** na działania testowanych elementów.

Trzecim sposobem na rozwiązanie problemu jest powtarzanie testów niestabilnych. Jeśli mamy test, który kończy się niepowodzeniem raz na dziesięć razy, powtarzając go raz, powinniśmy obniżyć prawdopodobieństwo niepowodzenia do 1/100; powtarzając go dwa razy — do 1/1000. Przy bazowym prawdopodobieństwie wynoszącym 1/100 uzyskamy jeszcze większy spadek. Dzięki temu, w teorii, bezproblemowo przejdziemy od prawej krawędzi powyższej tabeli (duży wskaźnik awaryjności) do lewej (bardzo niska szansa na niepowodzenie).

## Java i Android

Ponieważ niestabilne testy są dosyć częstym problemem podczas weryfikacji interfejsu użytkownika w Androidzie (podobną kategorią są testy Selenium), pokażę, jak zaimplementować mechanizm powtórzeń testów na tej platformie. W przeszłości ta funkcja była standardowo dostępna wraz z adnotacją [@FlakyTest](https://developer.android.com/reference/android/test/FlakyTest.html). Wraz z wprowadzeniem pakietu testowego `androidx.test` opcja ta została niestety usunięta. Niemniej jednak, jeśli korzystamy z JUnita to nie mamy czym się przejmować. JUnit jest dość potężnym narzędziem i zapewnia nam interfejs pozwalający zaimplementować tę funkcjonalność w kilku prostych krokach. W podobny sposób można to zrealizować w standardowej Javie.

### RetryStatement

Zacznijmy od samego rdzenia. Każda część kodu klasy testowej opakowywana jest w `org.junit.runners.model.Statement` za pomocą metody `evaluate`.
Pod uwagę barny jest nie tylko kod metody z adnotacją `@Test`, ale także kod pozostałych metod z adnotacjami, takimi jak `@BeforeClass` czy `@AfterClass`. W związku z tym, pierwszym krokiem do zaimplementowania naszej funkcji ponawiania jest udekorowanie tej klasy w następujący sposób:

```java
class RetryStatementDecorator extends Statement {

    private static final String TAG = RetryStatementDecorator.class.getSimpleName();

    private final int tryLimit;
    private final Statement base;
    private final Description description;

    RetryStatementDecorator(Statement base, Description description, int tryLimit) {
        this.base = base;
        this.description = description;
        this.tryLimit = tryLimit;
    }

    @Override
    public void evaluate() throws Throwable {
        Throwable caughtThrowable = null;

        for (int i = 0; i < tryLimit; i++) {
            try {
                base.evaluate();
                return;
            } catch (Throwable t) {
                caughtThrowable = t;
                Log.w(TAG, String.format(Locale.getDefault(), "%s: run %d failed", description.getDisplayName(), (i + 1)));
            }
        }
        Log.w(TAG, String.format(Locale.getDefault(), "%s: giving up after %d failures", description.getDisplayName(), tryLimit));
        //noinspection ConstantConditions
        throw caughtThrowable;
    }

}
```

### RetryTestRule

Następną rzeczą, którą musimy zrobić, jest zaaplikowanie naszej klasy do testów. Na pewno możemy użyć interfejsu `TestRule` i zaimplementować własny odpowiednik:

```java
public class RetryRule implements TestRule {

    private int tryLimit;

    public RetryRule(int tryLimit) {
        this.tryLimit = tryLimit;
    }

    public Statement apply(Statement base, Description description) {
        return new RetryStatementDecorator(base, description, tryLimit);
    }

}
```

Z bardzo prostym sposobem użycia w klasie testowej:
```java
    @Rule
    public RuleChain testRule = RuleChain
            .outerRule(new ActivityTestRule<>(MainActivity.class, true, true))
            .around(new ScreenshotOnTestFailedRule());
            .around(new RetryRule());
```

I to zadziała w wielu przypadkach, ogólnie jednak **tylko metoda z adnotacją @Test zostanie powtórzona**. Oznacza to, że dany test zostanie ponownie wykonany dla stanu *Activity*, jaki pozostał po nieudanym wykonaniu. Wyobraź sobie, że masz test, który przykładowo otwiera menu i szuka w nim określonego elementu. Podczas kolejnej próby test zakończy się niepowodzeniem przy otwieraniu menu, ponieważ menu będzie już otwarte. Możesz oczywiście obejść ten problem w ten czy inny sposób, ale najlepszym sposobem byłoby wdrożenie powtórzenia na wyższym poziomie — na poziomie *runnera*.

### RetryRunner

Dochodząc do tego momentu, cała implementacja może wydawać się nieco złożona, w zasadzie jest jednak bardzo prosta. Chcemy zaimplementować funkcję ponawiania zarówno na poziomie bloku kodu odnoszącego się do klasy (`@BeforeClass`), jak i na poziomie bloku metody (`@Test1`). W ten sposób za każdym razem, gdy nasz test się nie powiedzie, będziemy mieli pewność, że nasze *Activity* zostanie stworzone na nowo. W tym celu rozszerzymy `AndroidJUnit4ClassRunner`. Prawdopodobnie moglibyśmy użyć tutaj `BlockJUnit4ClassRunner`, ponieważ klasa ta zawiera wszystko, czego potrzebujemy, jednak jeśli zerkniesz na implementację `AndroidJUnit4`, czyli klasy, która jest standardowo wykorzystywana do testów w Androidzie, zobaczysz, że inicjuje ona właśnie `androidx.test.internal.runner.junit4.AndroidJUnit4ClassRunner`. Dobrą zasadą jest ograniczanie zmian do minimum.

```java
public class RetryRunner extends AndroidJUnit4ClassRunner {

    public RetryRunner(Class<?> klass) throws InitializationError {
        super(klass);
    }

    @Override
    protected Statement classBlock(RunNotifier notifier) {
        return new RetryStatementDecorator(super.classBlock(notifier), getDescription(), BuildConfig.IT_TEST_TRY_LIMIT);
    }

    @Override
    protected Statement methodBlock(FrameworkMethod method) {
        return new RetryStatementDecorator(super.methodBlock(method), describeChild(method), BuildConfig.IT_TEST_TRY_LIMIT);
    }

}
```
Całkiem proste, prawda? Ponownie wykorzystujemy zdefiniowaną wcześniej klasę `RetryStatementDecorator`, dekorując instrukcję otrzymaną z implementacji klas nadrzędnych. Do limitu liczby ponownych prób użyłem niestandardowego pola generowanego podczas procesu budowy w Gradle'u właściwego dla konfiguracji *debug*:

```gradle
android {
    buildTypes {
        debug {
            it.buildConfigField "int", "IT_TEST_TRY_LIMIT", ("true" == System.getenv("CI") ? 3 : 1).toString()
        }
    }
}
```
Wykorzystanie naszego nowego runnera polega na zamianie wartości adnotacji `@RunWith(AndroidJUnit4.class)` na `@RunWith(RetryRunner.class)`. W specyficznych przypadkach możesz także wypróbować opcję z udokumentowaną w javadocu klasy `AndroidJUnit4`:

> This implementation will delegate to the appropriate runner based on the build-system provided value. A custom runner can be provided by specifying the full class name in a 'android.junit.runner' system property.

Jednakże, jeśli runner będzie działał na urządzeniu/emulatorze (do czego nawiązuję w tym artykule), to miej na uwadze, że trudno tam ustawić wartości parametrów systemowych. Przydatna może być również klasa `RunnerBuilder`, ponieważ może być przekazana jako parametr do [runnera odpowiedzialnego za instrumentację](https://developer.android.com/reference/android/support/test/runner/AndroidJUnitRunner).

Teraz dla testu zakończonego niepowodzeniem, powinniśmy uzyskać uzyskać coś takiego:
```java
2019-12-01 16:15:49.176 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 1 failed
2019-12-01 16:15:51.788 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 2 failed
2019-12-01 16:15:54.053 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 3 failed
2019-12-01 16:15:54.054 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): giving up after 3 failures
2019-12-01 16:15:54.056 4818-4834/? E/TestRunner: junit.framework.AssertionFailedError
        at junit.framework.Assert.fail(Assert.java:48)
        at junit.framework.Assert.fail(Assert.java:56)
        at io.github.t3r1jj.pbmap.about.AboutActivityIT.onAboutCreate(AboutActivityIT.java:76)
        at java.lang.reflect.Method.invoke(Native Method)
        at org.junit.runners.model.FrameworkMethod$1.runReflectiveCall(FrameworkMethod.java:50)
        at org.junit.internal.runners.model.ReflectiveCallable.run(ReflectiveCallable.java:12)
        at org.junit.runners.model.FrameworkMethod.invokeExplosively(FrameworkMethod.java:47)
        at org.junit.internal.runners.statements.InvokeMethod.evaluate(InvokeMethod.java:17)
        at androidx.test.internal.runner.junit4.statement.RunAfters.evaluate(RunAfters.java:61)
        at org.junit.rules.TestWatcher$1.evaluate(TestWatcher.java:55)
        at androidx.test.rule.ActivityTestRule$ActivityStatement.evaluate(ActivityTestRule.java:531)
        at org.junit.rules.RunRules.evaluate(RunRules.java:20)
        at io.github.t3r1jj.pbmap.testing.RetryStatementDecorator.evaluate(RetryStatementDecorator.java:30)
        at org.junit.runners.ParentRunner.runLeaf(ParentRunner.java:325)
        at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:78)
        at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:57)
        at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
        at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
        at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
        at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
        at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
        at io.github.t3r1jj.pbmap.testing.RetryStatementDecorator.evaluate(RetryStatementDecorator.java:30)
        at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
        at org.junit.runners.Suite.runChild(Suite.java:128)
        at org.junit.runners.Suite.runChild(Suite.java:27)
        at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
        at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
        at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
        at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
        at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
        at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
        at org.junit.runner.JUnitCore.run(JUnitCore.java:137)
        at org.junit.runner.JUnitCore.run(JUnitCore.java:115)
        at androidx.test.internal.runner.TestExecutor.execute(TestExecutor.java:56)
        at androidx.test.runner.AndroidJUnitRunner.onStart(AndroidJUnitRunner.java:392)
        at android.app.Instrumentation$InstrumentationThread.run(Instrumentation.java:2074)
```

### Wtyczki Surefire i Failsafe

Jeśli używasz wtyczek *Surefire* lub *Failsafe* w swoim projekcie, sprawa może być znacznie prostsza. Te dwie wtyczki zapewniają [interfejs](https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html), umożliwiający ponowne uruchomienie nieudanych testów (JUnit 4.x):
```bash
mvn -Dsurefire.rerunFailingTestsCount=3 test
```

## Podsumowanie

Ponowne uruchamianie testów niestabilnych pozwala zmniejszyć liczbę niepowodzeń w naszym procesie CI/CD, bez konieczności usuwania problematycznych testów. Mogą one bowiem dostarczać użytecznych informacji, choć ogólnie dobrym pomysłem jest przeanalizowanie każdego przypadku przed zastosowaniem takiej funkcjonalności. Jeśli chcesz dowiedzieć się więcej o testach niedeterministycznych, polecam posty [Johna Micco](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) i [Jeffa Listfielda](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html) na temat niestabilności testów na blogu Google.