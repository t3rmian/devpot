---
title: JavaはDHT11には遅すぎる？ Pi4Jv2とpigpio
url: dht11-java-pi4j-pigpio
id: 113
category:
- java: Java
tags:
- rpi
- dht11
- pi4j
- pigpio
- 組み込み
- jmh
author: Damian Terlecki
date: 2023-06-30T20:00:00
source: https://github.com/t3rmian/rpidemo
---

組み込み、少なくともエッジデバイスにおいて、Javaが第一の選択肢になることはまずありません。しかし、私はここにいます。
Raspberry 3Bに接続された安価な温度センサーと、いくつかのJavaランタイムと共に。

<img width="700" src="/img/hq/dht11.jpg" title='Raspberry Pi 3Bに接続されたDHT11センサー' alt='Raspberry Pi 3Bに接続されたDHT11センサーの写真'>

温度に加えて、DHT11は
より正確な後継機であるDHT22と同じ方法で相対湿度も応答します。
合計40ビットの中に、湿度と温度の8ビット整数部と小数部のデータが2回ずつあり、最後に8ビットのチェックサムが付いています。

現在、Pi4Jは「Raspberry Pi上のあらゆるJava関連」を管理するための最も広く使用されているライブラリです。
Googleで検索すれば、Java/Pi4Jを使ってDHT11から測定値を取得できるとされるいくつかの例に出くわすでしょう。
しかし、それらがPythonコードを実行するためのラッパーとして機能しているか、送信をタイムリーに読み取るのに苦労していることに気づくのに、そう時間はかかりません。

## なぜなのでしょうか？単にJavaが遅すぎるのでしょうか？

Javaの主な特徴は、異なるシステムで実行できる中間表現であるバイトコードにコンパイルされることです。
このため、そのパフォーマンスはネイティブ実装よりも比較的遅くなります。
状況が変わるのは、JITコンパイラがパフォーマンスクリティカルな領域を特定し、それらを非常に効率的なネイティブコードにコンパイルして最適化した場合です。
時折、ガベージコレクションが
プログラムをほんの少しの間停止させたり遅くしたりすることもあります。

送信は単線双方向で、約18 + 4ミリ秒続くとされています。

<figure>
<img src="/img/hq/dht11-transmission.jpg" alt="DHT11の通信プロセス" title="DHT11通信プロセスグラフ">
<figcaption><center><i>出典: <a href="https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf">Mouserのデータシート</a></i></center></figcaption>
</figure>

しかし、どのようなタイミングが必要なのでしょうか？見てみましょう。

1. MCU（RPI）は、少なくとも18ミリ秒間電圧をプルダウンして開始信号を送信します。
2. MCUは電圧をプルアップし、20～40マイクロ秒間DHTの応答を待ちます。
3. DHTは80マイクロ秒間電圧をプルダウンします。
4. DHTは80マイクロ秒間電圧をプルアップします。
5. DHTは40ビットのデータを送信します。
  - DHTは50マイクロ秒間電圧をプルダウンします。
  - DHTはその後、以下のいずれかの時間、電圧をプルアップします。
    - 26～28マイクロ秒で「0」を示す、または
    - 70マイクロ秒で「1」ビットを示す
6. DHTは電圧をプルダウンしてデータ送信を終了します。
7. DHTは電圧をプルアップして通信を終了します。

これらのタイミングから、2つの重要なポーリング制約が生じます。
GPIOを十分な速さで出力から入力に切り替える（180マイクロ秒）能力と、信号の持続時間を区別するのに十分な速さでサンプリングする能力が必要です。十分な速さとは何か、と尋ねるかもしれませんね。

その答えはすでにナイキストとシャノンによって与えられており、それは<i>f<sub>s</sub> ≥ 2 × f<sub>max</sub></i>です。ここで、
- <i>f<sub>s</sub></i>はサンプリングレート（サンプル/秒またはHz）
- <i>f<sub>max</sub></i>は信号の最高周波数成分（Hz）

<center>
<i>f<sub>max</sub> = 1 / (26 s × 10<sup>^-6</sup>) ≈ 40 kHz</i>
<br/>
<i>f<sub>s</sub> ≥ 80 kHz = 12.5マイクロ秒ごとにサンプリング</i>
</center>

それが達成可能かどうか、いくつかのJMHベンチマークを実行してみましょう。

## Pi4J v2のためのJavaマイクロベンチマークハーネス

Pi4Jは最近2回目のメジャーリリースを行い、最初のバージョンは廃止されました。
簡単なmaven設定でシームレスなビルドが可能で、開発環境としては、PCとリモート（SSH）RPI実行ターゲットを使用しています。
一つの注意点は、Pi4J 2.3.0がGPIOへのルートアクセスを必要とするCライブラリ*pigpio*を使用していることです。

> **注意：** RPIでルートログインを有効にすることはできますが、そうすると、基盤となるOpenSSHを使用している場合に[プロセスをsigtermで終了させるオプションを失います](https://youtrack.jetbrains.com/issue/IDEA-308213/SSH-Processes-are-not-killable-if-connected-to-root-user)。最悪の場合、別のセッションからそれを強制終了しようと試みることができます。

これが不可欠なMavenプロジェクト設定です。
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

続いて、初期化と読み取りのベンチマークです。

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

これらのベンチマークでは、メソッドのn回目の実行後に持続時間がどれだけ減少するかを把握しようとしています（*SingleShotTime*モード）。
うまくいけば、JITがいくつかのものを超高速のネイティブコードにコンパイルすることを決定するでしょう。

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

12.5マイクロ秒未満の読み取り持続時間を達成するには、JITコンパイラが100000回未満のどこかでイテレーションを要しました。
安定した読み取りのためのウォームアップの最小時間を見積もるには、別のベンチマークモードを実行する必要がありますが、私の推測では10秒以内でしょう。

## 事前（AOT）コンパイルは助けになるか？

近年、GraalVMを使用してネイティブイメージをビルドする機会が与えられました。
必要なのは[VM](https://www.graalvm.org/downloads/)をダウンロードし、`native-image`ツールを使用することだけです。
Mavenの`org.graalvm.buildtools:native-maven-plugin`がこのプロセスを効率化します。このプロセスには、`META-INF/native-image`にさらに2つのファイルが必要です。
`proxy-config.json`はPi4Jが使用する動的プロキシインターフェースを指定し、`jni-config.json`はコンパイラがネイティブの*pigpio*コールバックをJavaにリンクするのを助けます。

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

必然的に、`mvn clean package -Pnative`はかなりの量のメモリ（約2-3G）、時間（約3分）、そしてターゲットアーキテクチャのホストを必要とします。
RPIの限られたRAMリソースはスワップを増やすことで回避できますが、ビルド時間が15分に達するようなワークロードには本来意図されていません。
代替案として、仮想サーバーを使用する方法があります。例えば、Oracle Cloud Infrastructureは、快適な量の無料リソースを備えた`aarch64`ボックスを提供しています。

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

さて、私の非科学的なテストに移ると、結果は驚くほど満足のいくもので、時折発生するガベージコレクションのオーバーヘッドを除けばです。
確かに、初期化時間はJITよりもはるかに良いようです。おそらく、いくつかの部分がコンパイラをトリガーするほどホットではなかったのでしょうか？
```shell
Pi4Jv2 Initialization duration: 11927ns
Pi4Jv2 Read duration: 7083ns, state HIGH
```

この時点で、プロセスの面倒さのために私は中断しましたが、まだ続きがあります。
[OracleのGraalVM Editionの機能と利点の比較](https://www.oracle.com/a/ocom/docs/graalvm_enterprise_community_comparison_2021.pdf)によると、
私が使用したCEエディションは「JITコンパイルよりも約50%遅い」です。
しかし、GraalVM Enterprise Editionでコンパイルされたネイティブ実行ファイルは、[プロファイルガイド付き最適化](https://www.graalvm.org/22.0/reference-manual/native-image/PGO/)を使用してJITよりも速くなる可能性があります。
EEはOCI上で無料で利用できるため、この点に言及しています。注意点としては、*pgpio*ライブラリへの依存性を考えると、どのように適切にプロファイルガイドするかです。

> RPI上のネイティブ実行可能ファイルは、*libpi4j-pigpio.so*バインディングライブラリのルックアップをうまく処理しません。`pi4j-library-pigpio-2.3.0.jar!lib/aarch64/`からそれを解凍し、Javaシステムプロパティ`pi4j.library.path`を使用してその場所を提供する必要があります。一方、OCI PGOの場合、通常RPIにプリインストールされているネイティブの*pigpio*ライブラリも不足します。

## *pi4j-library-pigpio*で高速化

驚くべきことに、`pi4j-plugin-pigpio`に含まれる`pi4j-library-pigpio`を直接使用することで、Pi4Jの1層をスキップできます。
これには抽象化がはるかに少なく（低レベルで、オブジェクト作成が少なく、検証も少ない）、*pigpio*へのタイトなバインディングを維持しています。

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

これでずっと良くなりました。最初の信号から安定した通信を期待できます。

## 驚くほど正確な*pigpio*

Java開発者として、信号の正確な持続時間を取得するためにポーリングすることには違和感がありました。
途中で、この情報をすでに実装しているインターフェースを探し始めました。

*pigpio*のドキュメントを調べたところ、[状態アラートリスニング](https://abyz.me.uk/rpi/pigpio/cif.html#gpioSetAlertFunc)のような有望な関数がいくつか見つかりました。
Pi4Jでは、この関数はデフォルトの10マイクロ秒のデバウンス設定と、ティック（状態遷移時間）情報が欠落していることによって隠されていました。
そのため、状態の変更をタイムリーに報告していませんでした。
*pi4j-library-pigpio*の1つ下のレベルでは、期待されるインターフェースが見つかり、デフォルトの5マイクロ秒の*pigpio*サンプリングレートを変更することもできます。

*pigpio*のヘッダー定義をさらに詳しく見ると、2つのスレッドがあるようです。
1つは状態変化を登録するためのもので、もう1つはコールバックに報告するためのものです。これにより、読み取りが驚くほど正確になり（1マイクロ秒まで）、コールバックが処理に十分な時間（かなり寛大なバッファ/時間内）を得ることができます。
報告の遅延の可能性と引き換えに。私のケースには完璧です。

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

このアプローチにより、通常Javaで期待されるような、より読みやすい高レベルのコードを実装できます。
必要なのは、初期登録(#1)の後に信号のタイミング(#2)を保存することだけです。
送信の最後のビットを受信すると、コールバックスレッドが呼び出し元のスレッドを起こします(#3)。
その後、信号の時間をデータビットに、そして相対湿度と温度に解析する時間を取ることができます(#4)。

<img loading="lazy" src="/img/hq/dht11-java-results.png" title='gpioSetAlertFuncを使用した安定したDHT11のJava読み取りのデバッグ出力' alt='gpioSetAlertFuncを使用した安定したDHT11のJava読み取りのデバッグ出力'>

完全なデモコードは[https://github.com/t3rmian/rpidemo](https://github.com/t3rmian/rpidemo)で見つけることができます。
ポーリングソリューションを試してみたい場合は、*pi4j-v2*プロジェクトの["Unable to read DHT22 sensor"](https://github.com/Pi4J/pi4j-v2/discussions/191)のディスカッションをご覧ください。

## まとめ

時々Javaは遅いことがありますが、それでも魅力はあります。
JITを活用したり、GraalVM SEやEEでネイティブイメージをビルドしたり、PGOを少し加えることもできます。
Pi4Jで時間がないときは、高抽象化パッケージをスキップして、提供されている*pi4j-library-pigpio*を使用できます。
最良の結果は、*pigpio*のスレッド化されたアラートコールバックのような、よく考えられたインターフェースでしばしば達成されます。
ハードリアルタイムシステムの実装が必要ない限りは…

