---
title: Czy Java jest zbyt powolna dla DHT11? Pi4Jv2 i pigpio
url: dht11-java-pi4j-pigpio
id: 113
category:
  - java: Java
tags:
  - rpi
  - dht11
  - pi4j
  - pigpio
  - embedded
  - jmh
author: Damian Terlecki
date: 2023-06-30T20:00:00
source: https://github.com/t3rmian/rpidemo
---

Java z pewnością nie jest pierwszym wyborem dla w przypadku systemów embedded, przynajmniej nie dla urządzeń brzegowych.
Z drugiej strony właśnie podłączyłem tani czujnik temperatury do Raspberry 3B i pod ręką mam środowisko Javy.

<img width="700" src="/img/hq/dht11.jpg" title='Sensor DHT11 podłączony do Raspberry Pi 3B' alt='Sensor DHT11 podłączony do Raspberry Pi 3B'>

Oprócz temperatury, DHT11 podaje również wilgotność względną w taki sam sposób, jak jego bardziej precyzyjny
następca DHT22. W 40 bitach odpowiedzi odnajdziesz dwa razy dwie 8-bitowe liczby całkowite i dziesiętne reprezentujące kolejno wilgotność i temperaturę.
Transmisję danych domyka 8-bitowa suma kontrolna.

Obecnie Pi4J jest najczęściej używaną biblioteką do zarządzania „wszelkimi rzeczami Java na Raspberry Pi”.
W Google szybko odnajdziesz kilka przykładów, które mają za zadanie pobrać informacje z sensora DHT przy użyciu Javy.
Po kilku (dziesięciu) minutach zdasz sobie jednak sprawę, że albo działają one jako wrapper wywołujący właściwy program w Pythonie, albo
implementacja nie działa zbyt stabilnie.

## Dlaczego? Czy Java jest po prostu zbyt wolna?


Dominującą cechą Javy jest to, że kompiluje się do kodu bajtowego, który jest reprezentacją pośrednią, uruchamialną
na wielu systemach.
Z tego powodu wydajność jest stosunkowo wolniejsza niż implementacja natywna.
Sytuacja zmienia się, gdy kompilator JIT (Just In Time) zidentyfikuje obszary krytyczne pod względem wydajności i zoptymalizuje je, kompilując je do wysoce wydajnego kodu natywnego.
Wszystko to odbywa sie w akompaniamencie *garbage collectora* okazjonalnie zatrzymującego bądź spowalniającego działanie programu na krótką chwilę.

Na tapet weźmy więc transmisję – jest dwukierunkowa jednoprzewodowa i trwa około 18 + 4 ms:

<figure>
<img src="/img/hq/dht11-transmission.jpg" alt="Proces komunikacji z sensorem DHT11" title="Graf procesu komunikacji z sensorem DHT11">
<figcaption><center><i>Źródło: <a href="https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf">Mouser Datasheet</a></i></center></figcaption>
</figure>

Popatrzmy na oczekiwane czasy sygnałów:

1. MCU (RPI) wysyła sygnał startu, obniżając napięcie (0) na co najmniej 18 ms;
2. MCU podnosi napięcie (1) i czeka na odpowiedź DHT przez 20-40 µs;
3. DHT obniża napięcie na 80 µs;
4. DHT podciąga napięcie na 80 µs;
5. DHT rozpoczyna wysyłkę 40 bitów danych:
    - DHT obniża napięcie na 50 µs;
    - DHT podnosi napięcie na:
        - 26-28 µs oznaczające '0' lub;
        - 70 µs wskazujące bit '1';
6. DHT kończy transmisję danych obniżając napięcie;
7. DHT kończy komunikację poprzez podniesienie napięcia.

Z tych czasów wynikają dwa kluczowe ograniczenia dla *pollingu*.
Musimy być w stanie przełączyć GPIO wystarczająco szybko z wyjścia na wejście (\~180 µs) oraz próbkować z wystarczającą szybkością, aby
rozróżnić czasy trwania sygnału. Co to znaczy wystarczająco szybko?

Odpowiedź została już udzielona przez Nyquista i Shannona, i jest nią wzór <i>f<sub>s</sub> ≥ 2 × f<sub>max</sub></i>, gdzie:
- <i>f<sub>s</sub></i> to częstotliwość próbkowania (w próbkach na sekundę lub Hz);
- <i>f<sub>max</sub></i> to składowa sygnału o najwyższej częstotliwości (w Hz).

<center>
<i>f<sub>max</sub> = 1 / (26 s × 10<sup>^-6</sup>) ≈ 40 kHz</i>
<br/>
<i>f<sub>s</sub> ≥ 80 kHz = próbkowanie co 12.5 µs</i>
</center>

Przeprowadźmy kilka testów JMH, aby sprawdzić, czy jest to osiągalne.

## Benchmark Pi4J v2 przy użyciu Java Microbenchmark Harness (JMH)

Pi4J doczekało się niedawno drugiego dużego wydania, a pierwsza wersja została wycofana z rozwoju.
Prosta konfiguracja mavenowa umożliwi Ci bezproblemowe budowanie. Jako środowiska programistycznego, używam PC ze zdalnym (SSH) celem uruchomieniowym RPI, zarządzanym przez IntelliJ.
Jedną z niedogodności jest to, że Pi4J 2.3.0 wykorzystuje bibliotekę C *pigpio*, która wymaga uprawnień *roota* do GPIO.

> **Uwaga:** Możesz włączyć logowanie roota na RPI, ale wtedy [stracisz opcję wymuszenia zamknięcia procesu](https://youtrack.jetbrains.com/issue/IDEA-308213/SSH-Processes-are-not-killable-if-connected-to-root-user). W najgorszym przypadku możesz spróbować zabić proces z innej sesji SSH.

Oto podstawowa konfiguracja projektu:
```xml
<properties>
    <pi4j.version>2.3.0</pi4j.version>
    <jmh.version>1.36</jmh.version>
</properties>

<dependencies>
    <dependency>
        <groupId>com.pi4j</groupId>
        <artifactId>pi4j-core</artifactId>
        <version>${pi4j.version}</version>
    </dependency>
    <dependency>
        <groupId>com.pi4j</groupId>
        <artifactId>pi4j-plugin-raspberrypi</artifactId>
        <version>${pi4j.version}</version>
    </dependency>
    <dependency>
        <groupId>com.pi4j</groupId>
        <artifactId>pi4j-plugin-pigpio</artifactId>
        <version>${pi4j.version}</version>
    </dependency>
    
    <dependency>
        <groupId>org.openjdk.jmh</groupId>
        <artifactId>jmh-core</artifactId>
        <version>${jmh.version}</version>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.openjdk.jmh</groupId>
        <artifactId>jmh-generator-annprocess</artifactId>
        <version>${jmh.version}</version>
        <scope>test</scope>
    </dependency>
</dependencies>
```

Następnie testy inicjalizacji GPIO i odczytu.

```java
@State(Scope.Benchmark)
@Fork(value = 1)
@Warmup(iterations = 0)
@BenchmarkMode(Mode.SingleShotTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Threads(value = 1)
public class Pi4Jv2Benchmark extends JMHJITGPIOBenchmark {
    Context pi4j;
    DigitalInput input;

    @Setup(Level.Trial)
    public void setUp() {
        pi4j = Pi4J.newAutoContext();
        DigitalInputConfig inCfg = DigitalInput.newConfigBuilder(pi4j)
                .address(DHT11_GPIO)
                .pull(PullResistance.OFF)
                .debounce(0L)
                .provider("pigpio-digital-input")
                .build();
        input = pi4j.create(inCfg);
    }

    @TearDown(Level.Trial)
    public void tearDown() {
        pi4j.shutdown();
    }

    @Benchmark
    @Measurement(iterations = 1000)
    public void testRead_100(Blackhole blackhole) {
        blackhole.consume(input.state());
    }

    @Benchmark
    @Measurement(iterations = 10)
    public void testInitialize_10() {
        input.initialize(pi4j);
    }

    //...
}
```

Przy pomocy tego benchmarku staram się zorientować, o ile zmniejszy się czas trwania po n-tym wykonaniu metody (tryb *SingleShotTime*).
Mam nadzieję, że JIT zdecyduje się skompilować niektóre rzeczy do wystarczająco wydajnego kodu natywnego.

```shell
Benchmark                             Mode     Cnt       Score       Error  Units
Pi4Jv2Benchmark.testInitialize_1        ss          137497.000              ns/op
Pi4Jv2Benchmark.testInitialize_10       ss      10  167089.200 ± 49132.217  ns/op
Pi4Jv2Benchmark.testInitialize_100      ss     100  174594.980 ± 20509.078  ns/op
Pi4Jv2Benchmark.testInitialize_1000     ss    1000  144984.940 ±  6403.755  ns/op
Pi4Jv2Benchmark.testInitialize_10000    ss   10000  123345.067 ±  5324.980  ns/op
Pi4Jv2Benchmark.testRead_100            ss     100   92882.500 ±  7699.051  ns/op
Pi4Jv2Benchmark.testRead_1000           ss    1000  104655.871 ± 29442.669  ns/op
Pi4Jv2Benchmark.testRead_10000          ss   10000   53066.052 ±  1810.808  ns/op
Pi4Jv2Benchmark.testRead_100000         ss  100000    7755.533 ±   308.039  ns/op
```

Aby osiągnąć czas trwania odczytu poniżej 12,5 µs, kompilator JIT potrzebował nieco mniej niż 100000 iteracji.
Do oszacowania minimalnego czasu potrzebnego na taką rozgrzewkę, należałoby uruchomić inny tryb testu porównawczego.
Można jednak oczekiwać, że po 10 sekundach komunikacja będzie dużo stabilniejsza.

## Czy kompilacja z wyprzedzeniem (AOT) jest tu potencjalną alternatywą?

Ostatnie lata dały nam możliwość budowania natywnych aplikacji uruchomieniowych przy użyciu GraalVM.
Wystarczy, że pobierzesz [maszynę wirtualną](https://www.graalvm.org/downloads/) i wykorzystasz narzędzie `native-image`.
Wtyczka `org.graalvm.buildtools:native-maven-plugin` znacznie usprawnia ten proces. Dwa pliki w `META-INF/native-image` są dodatkowo wymagane do budowania w przypadku Pi4J v2.
Plik `proxy-config.json` określa dynamiczne interfejsy proxy używane przez bibliotekę, a `jni-config.json` pomaga kompilatorowi w łączeniu natywnego callbacku z *pigpio* do Javy.

```xml
<profile>
    <id>native</id>
    <build>
        <plugins>
            <plugin>
                <groupId>org.graalvm.buildtools</groupId>
                <artifactId>native-maven-plugin</artifactId>
                <version>0.9.22</version>
                <extensions>true</extensions>
                <executions>
                    <execution>
                        <id>build-native</id>
                        <goals>
                            <goal>compile-no-fork</goal>
                        </goals>
                        <phase>package</phase>
                    </execution>
                </executions>
                <configuration>
                    <skipNativeTests>true</skipNativeTests>
                    <verbose>true</verbose>
                    <mainClass>dev.termian.rpidemo.test.CrudeNativeTestMain</mainClass>
                </configuration>
            </plugin>
        </plugins>
    </build>
</profile>
```

Niewątpliwie `mvn clean package -Pnative` potrzebuje znaczącej ilości pamięci (\~2-3G), czasu (\~3 min) i docelowej maszyny z docelową architekturą.
Ograniczone zasoby pamięci RAM na RPI można obejść, zwiększając swap, ale tak naprawdę malinka nie jest przeznaczone do takich obciążeń.
Czas kompilacji dochodzi do 15 minut.
Alternatywą jest użycie serwera wirtualnego. Na przykład chmura Oracle (OCI) udostępnia maszynę w architekturze `aarch64` z zadowalającą ilością darmowych do wypróbowania zasobów.

```java
### OCI
---------------------------------------------------------------------------
  3.2s (1.6% of total time) in 24 GCs | Peak RSS: 2.22GB | CPU load: 0.96
---------------------------------------------------------------------------
Finished generating 'rpidemo' in 3m 24s.

### RPI 3B
---------------------------------------------------------------------------
108.4s (12.0% of total time) in 102 GCs | Peak RSS: 0.77GB | CPU load: 2.81
---------------------------------------------------------------------------
Finished generating 'rpidemo' in 14m 55s.
```

Przechodząc teraz do mojego nienaukowego testu, wyniki są niezwykle zadowalające, nie licząc sporadycznego narzutu związanego z *garbage collectorem*.
Z pewnością czas inicjalizacji wygląda znacznie lepiej niż w przypadku JIT. Może niektóre części nie były wystarczająco gorące, aby uruchomić kompilator?

```shell
Pi4Jv2 Initialization duration: 11927ns
Pi4Jv2 Read duration: 7083ns, state HIGH
```

W tym momencie postanowiłem zatrzymać się z powodu uciążliwości procesu, ale to nie koniec możliwości.
Według ["Oracle's GraalVM Edition feature and benefit comparison"](https://www.oracle.com/a/ocom/docs/graalvm_enterprise_community_comparison_2021.pdf),
edycja CE, z której korzystałem "jest o około 50% wolniejsza niż kompilacja JIT".
GraalVM Enterprise Edition ma teoretycznie budować o programy wykonawcze optymalniejsze niż JIT.
Potrzebuje do tego testowego uruchomienia tzw. [PGO](https://www.graalvm.org/22.0/reference-manual/native-image/PGO/).
Wspominam o tym, ponieważ wersja EE może być używana bezpłatnie w OCI.
Zagwoztką może okazać się jednak zależność uruchomienia od biblioteki natywnej *pgpio*.

> Natywny plik wykonywalny na RPI nie radzi sobie zbyt dobrze z wyszukiwaniem biblioteki natywnej *libpi4j-pigpio.so*, wymaga rozpakowania z `pi4j-library-pigpio-2.3.0.jar!lib/aarch64/` i podania jego lokalizację za pomocą właściwości systemowej Java `pi4j.library.path`. Z drugiej strony, w przypadku OCI PGO biblioteka *pigpio*, też nie jest preinstalowana tak jak na RPI.

## Przyspieszamy z *pi4j-library-pigpio*

Co zaskakujące, możemy pominąć jedną warstwę Pi4J, bezpośrednio używając `pi4j-library-pigpio` zawartej w `pi4j-plugin-pigpio`.
Charakteryzuje się ona niższy poziomem abstrakcji, ograniczonym tworzeniem obiektów, i minimalną walidacją. Utrzymuje ścisłe powiązanie z natywną biblioteką *pigpio*.

```java
@State(Scope.Benchmark)
@Fork(value = 1)
@Warmup(iterations = 0)
@BenchmarkMode(Mode.SingleShotTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Threads(value = 1)
public class PIGPIOBenchmark extends JMHJITGPIOBenchmark {
    @Setup(Level.Trial)
    public void setUp() {
        PIGPIO.gpioInitialise();
        PIGPIO.gpioSetMode(DHT11_GPIO, PiGpioConst.PI_INPUT);
        PIGPIO.gpioSetPullUpDown(DHT11_GPIO, PiGpioConst.PI_PUD_OFF);
        PIGPIO.gpioGlitchFilter(DHT11_GPIO, 0);
        PIGPIO.gpioNoiseFilter(DHT11_GPIO, 0, 0);
    }

    @TearDown(Level.Trial)
    public void tearDown() {
        PIGPIO.gpioTerminate();
    }

    @Benchmark
    @Measurement(iterations = 1000)
    public void testRead_100(Blackhole blackhole) {
        blackhole.consume(PIGPIO.gpioRead(DHT11_GPIO));
    }

    @Benchmark
    @Measurement(iterations = 10)
    public void testInitialize_1() {
        PIGPIO.gpioSetMode(DHT11_GPIO, PiGpioConst.PI_INPUT);
    }

    //...
}
```

JMH:
```shell
Benchmark                             Mode     Cnt       Score       Error  Units
PIGPIOBenchmark.testInitialize_1        ss           24479.000              ns/op
PIGPIOBenchmark.testInitialize_10       ss      10   12317.300 ±  6646.228  ns/op
PIGPIOBenchmark.testInitialize_100      ss     100   13350.620 ±  3460.271  ns/op
PIGPIOBenchmark.testInitialize_1000     ss    1000   12948.114 ±  2407.712  ns/op
PIGPIOBenchmark.testRead_100            ss     100   24913.410 ± 21993.740  ns/op
PIGPIOBenchmark.testRead_1000           ss    1000   18125.702 ±  1854.193  ns/op
PIGPIOBenchmark.testRead_10000          ss   10000    8577.220 ±  1288.801  ns/op
PIGPIOBenchmark.testRead_100000         ss  100000    1837.087 ±    83.765  ns/op
```

Rezultaty dla tego podejścia wyglądają znacznie lepiej. Możemy spodziewać się stabilnej komunikacji już od pierwszego sygnału.

## Wysoka precyzja *pigpio*

Jako programiście Java, odpytywanie w celu uzyskania dokładnego czasu trwania sygnału nie odpowiadało mi ze względu na niskopoziomowość i niedokładność próbkowania.
W połowie drogi zacząłem szukać interfejsu, który już by implementował przetwarzanie takich informacji.

Przejrzałem dokumentację *pigpio* i znalazłem kilka obiecujących funkcji, takich jak [funkcja alertu o stanie GPIO](https://abyz.me.uk/rpi/pigpio/cif.html#gpioSetAlertFunc).
W Pi4J funkcja ta była ukryta przez domyślną konfigurację *debounce 10 µs* i z tego powodu nie raportowała na czas zmian stanu.
Brakowało jej też informacji o *tickach* (czas przełączania stanu).
Jeden poziom niżej w *pi4j-library-pigpio* znalazłem oczekiwany interfejs, a także sposób ustawiania częstotliwości próbkowania (standardowo 5 µs).

Definicje nagłówków *pigpio*, dają dodatkowe informacje na temat implementacji funkcji alertu, w której udział biorą przynajmniej dwa wątki.
Jeden służy do rejestracji zmiany stanu, a drugi do raportowania wywołania zwrotnego. Sprawia to, że odczyt jest niesamowicie precyzyjny (nawet do 1 µs), a także zapewnia wywołaniu zwrotnemu wystarczająco dużo czasu na przetworzenie (w ramach dostępnego bufora / limitu czasu).
W zamian musimy spodziewać się opóźnienia w raportowaniu. Idealne rozwiązanie w moim przypadku.

```java
public class DHT11TemperatureListener implements PiGpioAlertCallback {
    //...
    private final long[] signalTimes = new long[MCU_START_BITS + DHT_START_BITS + DHT_RESPONSE_BITS];
    private final int gpio;
    private int signalIndex;

    public DHT11TemperatureListener(int gpio, int sampleRate) {
        this.gpio = gpio;
        Arrays.fill(signalTimes, -1);
        initPGPIO(gpio, sampleRate);
    }

    protected void initPGPIO(int gpio, int sampleRate) {
        PIGPIO.gpioCfgClock(sampleRate, 1, 0);
        PIGPIO.gpioSetPullUpDown(gpio, PiGpioConst.PI_PUD_OFF);
        PIGPIO.gpioGlitchFilter(gpio, 0);
        PIGPIO.gpioNoiseFilter(gpio, 0, 0);
    }

    public HumidityTemperature read() throws InterruptedException {
        sendStartSignal(); // #1
        waitForResponse();
        try {
            return parseTransmission(signalTimes); // #4
        } finally {
            clearState();
        }
    }

    private void sendStartSignal() throws InterruptedException {
        PIGPIO.gpioSetAlertFunc(gpio, this);
        PIGPIO.gpioSetMode(gpio, PiGpioConst.PI_OUTPUT);
        PIGPIO.gpioWrite(gpio, PiGpioConst.PI_LOW);
        TimeUnit.MILLISECONDS.sleep(20);
        PIGPIO.gpioWrite(gpio, PiGpioConst.PI_HIGH);
    }

    private void waitForResponse() throws InterruptedException {
        PIGPIO.gpioSetMode(gpio, PiGpioConst.PI_INPUT);
        synchronized (this) {
            wait(1000); // #3
        }
    }

    @Override
    public void call(int pin, int state, long tick) {
        signalTimes[signalIndex++] = tick; // #2
        if (signalIndex == signalTimes.length) {
            logger.debug("Last signal state: {}", state);
            synchronized (this) {
                notify(); // #3
            }
        }
    }
    //...
}
```

Takie podejście pozwala na implementację bardziej czytelnego kodu wyższego poziomu, podobnego do tego, czego zwykle można oczekiwać w Javie.
Wszystko, co musisz zrobić, to po rejestracji *(#1)* zapisać czasy sygnału *(#2)*.
Po otrzymaniu ostatniego bitu transmisji wątek wywołania zwrotnego budzi wątek wywołujący *(#3)*.
Następnie można poświęcić czas na przekonwertowanie czasów sygnałów na bity danych, a dalej na wilgotność względną i temperaturę *(#4)*.

<img loading="lazy" src="/img/hq/dht11-java-results.png" title='Debug output of stable DHT11 Java reads using gpioSetAlertFunc' alt='Debug output of stable DHT11 Java reads using gpioSetAlertFunc'>

Pełny kod demonstracyjny znajdziesz pod adresem [https://github.com/t3rmian/rpidemo](https://github.com/t3rmian/rpidemo).
Jeśli chcesz wypróbować rozwiązanie z *pollingiem*, zapoznaj się z dyskusją ["Nie można odczytać czujnika DHT22"](https://github.com/Pi4J/pi4j-v2/discussions/191) w projekcie *pi4j-v2*.

## Podsumowanie

Java może wydawać się powolna, ale kompensuje to swoimi urokami.
Kolejny bieg wrzucasz, korzystając z JIT lub budując natywny obraz za pomocą GraalVM SE/EE+PGO.
W przypadku Pi4J, gdy zależy nam na czasie, można pominąć pakiety o wysokiej abstrakcji i użyć dostarczonego modułu *pi4j-library-pigpio*.
Najlepsze wyniki są jednak osiągane dzięki przemyślanym interfejsom, takim jak wielowątkowa funkcja alertów zwrotnych w *pigpio*.
Możesz cieszyć się Javą nawet w przypadku domowych systemów embedded.
