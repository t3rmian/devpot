---
title: É Java lento demais para o DHT11? Pi4Jv2 e pigpio
url: java-lento-demais-para-dht11-pi4j-pigpio
id: 113
category:
- java: Java
tags:
- rpi
- dht11
- pi4j
- pigpio
- embarcados
- jmh
author: Damian Terlecki
date: 2023-06-30T20:00:00
source: https://github.com/t3rmian/rpidemo
---

Java certamente não é a primeira escolha para sistemas embarcados, pelo menos não para dispositivos de borda. Mas aqui estou eu com um
sensor de temperatura barato conectado a um Raspberry Pi 3B com algum runtime Java.

<img width="700" src="/img/hq/dht11.jpg" title='Sensor DHT11 conectado ao Raspberry Pi 3B' alt='Foto do sensor DHT11 conectado ao Raspberry Pi 3B'>

Além da temperatura, o DHT11
também responde com a umidade relativa da mesma forma que seu sucessor mais preciso, o DHT22.
Dentro de um total de 40 bits, você encontrará duas vezes 8 bits para os dados integrais e decimais de umidade e temperatura, terminando com uma soma de verificação de 8 bits.

Atualmente, o Pi4J é a biblioteca mais utilizada para gerenciar "tudo relacionado a Java no Raspberry Pi".
Você pode encontrar alguns exemplos que supostamente recuperam as medições do DHT11 usando Java/Pi4J diretamente no Google.
Leva alguns minutos para perceber que eles funcionam como um wrapper para executar código Python ou encontram dificuldades para ler a transmissão a tempo.

## Por que isso acontece? Java é simplesmente lento demais?

A característica predominante do Java é que ele compila para bytecode, que é uma representação intermediária que pode ser executada
em diferentes sistemas.
Por causa disso, seu desempenho é relativamente mais lento que a implementação nativa.
A situação muda quando o compilador JIT identifica áreas críticas de desempenho e as otimiza, compilando-as em código nativo altamente eficiente.
De vez em quando, alguma coleta de lixo também
irá parar ou desacelerar seu programa por uma fração de segundo.

A transmissão é de dois sentidos em um único fio e diz-se que dura cerca de 18 + 4 ms:

<figure>
<img src="/img/hq/dht11-transmission.jpg" alt="Processo de comunicação do DHT11" title="Gráfico do processo de comunicação do DHT11">
<figcaption><center><i>Fonte: <a href="https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf">Datasheet da Mouser</a></i></center></figcaption>
</figure>

Mas que tempos são necessários? Vejamos:

1. MCU (RPI) envia um sinal de início puxando a tensão para baixo por pelo menos 18 ms;
2. MCU puxa a tensão para cima e espera pela resposta do DHT por 20-40 µs;
3. DHT puxa a tensão para baixo por 80 µs;
4. DHT puxa a tensão para cima por 80 µs;
5. DHT envia 40 bits de dados:
  - DHT puxa a tensão para baixo por 50 µs;
  - DHT puxa a tensão para cima por:
    - 26-28 µs, denotando '0' ou;
    - 70 µs, indicando bit '1';
6. DHT encerra a transmissão de dados puxando a tensão para baixo;
7. DHT encerra a comunicação puxando a tensão para cima.

Duas restrições cruciais de polling resultam desses tempos.
Devemos ser capazes de alternar o GPIO rápido o suficiente de saída para entrada (180 µs) e amostrar a uma taxa rápida o suficiente para
distinguir a duração do sinal. O que é rápido o suficiente, você pode perguntar?

A resposta já foi dada por Nyquist e Shannon, e é <i>f<sub>s</sub> ≥ 2 × f<sub>max</sub></i>, onde:
- <i>f<sub>s</sub></i> é a taxa de amostragem (em amostras por segundo ou Hz);
- <i>f<sub>max</sub></i> é o componente de frequência mais alto no sinal (em Hz).

<center>
<i>f<sub>max</sub> = 1 / (26 s × 10<sup>-6</sup>) ≈ 40 kHz</i>
<br/>
<i>f<sub>s</sub> ≥ 80 kHz = amostrar a cada 12.5 µs</i>
</center>

Vamos rodar alguns benchmarks JMH para ver se isso é alcançável.

## Java Microbenchmark Harness para Pi4J v2

O Pi4J teve um segundo grande lançamento recentemente, e a primeira versão foi descontinuada desde então.
Uma configuração simples do Maven permite uma construção sem problemas, e para o ambiente de desenvolvimento, eu uso um PC com um alvo de execução remoto (SSH) no RPI.
Uma ressalva é que o Pi4J 2.3.0 usa uma biblioteca C *pigpio* que requer acesso root ao GPIO.

> **Nota:** Você pode habilitar o login root no RPI, mas então você [perde a opção de encerrar o processo com sigterm](https://youtrack.jetbrains.com/issue/IDEA-308213/SSH-Processes-are-not-killable-if-connected-to-root-user) ao usar o OpenSSH subjacente. No pior dos casos, você pode tentar matá-lo de uma sessão diferente.

Aqui está a configuração essencial do projeto Maven:
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

Seguido pelos benchmarks de inicialização e leitura.

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

Nesses benchmarks, estou tentando ter uma ideia de quanto a duração diminuirá após a n-ésima execução do método (modo *SingleShotTime*).
Espero que o JIT decida compilar algumas coisas em código nativo super-rápido.

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

Para atingir um tempo de leitura inferior a 12.5 µs, o compilador JIT levou algo em torno de menos de 100000 iterações.
Você teria que executar um modo de benchmark diferente para estimar o tempo mínimo para um aquecimento de leitura estável, mas minha estimativa seria dentro de 10s.

## A compilação ahead-of-time (AOT) pode ajudar?

Os últimos anos nos deram a oportunidade de construir uma imagem nativa usando GraalVM.
Tudo que você precisa é baixar [a VM](https://www.graalvm.org/downloads/) e usar a ferramenta `native-image`.
O plugin Maven `org.graalvm.buildtools:native-maven-plugin` agiliza este processo. Dois arquivos em `META-INF/native-image` são adicionalmente necessários para este processo.
O `proxy-config.json` especifica interfaces de proxy dinâmico usadas pelo Pi4J e o `jni-config.json` ajuda o compilador a vincular o callback nativo do *pigpio* ao Java.

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

Inevitavelmente, o `mvn clean package -Pnative` consome uma quantidade considerável de memória (~2-3G), tempo (~3 min) e o host da arquitetura de destino.
Os recursos limitados de RAM no RPI podem ser contornados aumentando o swap, mas não é realmente destinado a cargas de trabalho que fazem a duração da compilação atingir 15 minutos.
Uma alternativa é usar um servidor virtual. Por exemplo, o Oracle Cloud Infrastructure fornece uma box `aarch64` com uma quantidade confortável de recursos gratuitos.

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

Agora, pulando para o meu teste não científico, os resultados são notavelmente satisfatórios, excluindo a sobrecarga ocasional da coleta de lixo.
Com certeza, o tempo de inicialização parece muito melhor do que com o JIT. Talvez algumas partes não estivessem quentes o suficiente para acionar o compilador?
```shell
Pi4Jv2 Initialization duration: 11927ns
Pi4Jv2 Read duration: 7083ns, state HIGH
```

Neste ponto, parei devido à complexidade do processo, mas há mais.
De acordo com a [comparação de recursos e benefícios da Edição GraalVM da Oracle](https://www.oracle.com/a/ocom/docs/graalvm_enterprise_community_comparison_2021.pdf),
a edição CE que usei "é aproximadamente 50% mais lenta que a compilação JIT".
No entanto, os executáveis nativos compilados com a GraalVM Enterprise Edition podem ser mais rápidos que o JIT usando [Profile-Guided Optimizations (PGO)](https://www.graalvm.org/22.0/reference-manual/native-image/PGO/).
Menciono isso porque o EE pode ser usado gratuitamente na OCI. A ressalva seria como guiá-lo adequadamente com o perfil, dada a dependência da biblioteca *pgpio*.

> O executável nativo no RPI não lida bem com a localização da biblioteca de ligação *libpi4j-pigpio.so*, você terá que descompactá-la de `pi4j-library-pigpio-2.3.0.jar!lib/aarch64/` e fornecer sua localização usando a propriedade de sistema Java `pi4j.library.path`. Por outro lado, para PGO na OCI, você também sentirá falta das bibliotecas nativas *pigpio* que geralmente são pré-instaladas no RPI.

## Acelerando com *pi4j-library-pigpio*

Surpreendentemente, você pode pular uma camada do Pi4J usando diretamente a `pi4j-library-pigpio` incluída pelo `pi4j-plugin-pigpio`.
Ela tem muito menos abstração (nível mais baixo, menos criações de objetos, menos validação) e mantém uma ligação estreita com o *pigpio*.

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

Agora isso parece muito melhor. Você pode antecipar uma comunicação estável desde o primeiro sinal.

## *pigpio* extremamente preciso

Como desenvolvedor Java, fazer polling para obter a duração precisa do sinal não me agradou.
No meio do caminho, comecei a procurar por uma interface que já implementasse essa informação.

Consultei a documentação do *pigpio* e encontrei algumas funções promissoras como [escuta de alerta de estado](https://abyz.me.uk/rpi/pigpio/cif.html#gpioSetAlertFunc).
No Pi4J, essa função estava escondida por uma configuração de debounce padrão de 10 µs combinada com a falta de informações de tick (tempo de mudança de estado).
É por isso que não reportava as mudanças de estado a tempo.
Um nível abaixo, na *pi4j-library-pigpio*, você encontrará a interface esperada, bem como poderá alterar a taxa de amostragem padrão de 5 µs do *pigpio*.

Dando uma olhada mais a fundo nas definições do cabeçalho do *pigpio*, parece que existem duas threads.
Uma é para registrar a mudança de estado e a outra para reportar ao callback. Isso torna a leitura extremamente precisa (até 1 µs), além de fornecer tempo suficiente para o processamento do callback (dentro de um buffer/tempo bastante tolerante).
A desvantagem são possíveis atrasos no reporte. Perfeito para o meu caso.

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

Essa abordagem permite a implementação de um código de nível mais alto e mais legível, semelhante ao que você esperaria normalmente em Java.
Tudo o que você precisa fazer é salvar os tempos *(#2)* do sinal após o registro inicial *(#1)*.
Ao receber o último bit da transmissão, a thread de callback acorda a sua thread de chamada *(#3)*.
Depois disso, você pode levar o tempo que precisar para analisar os tempos do sinal em bits de dados e, em seguida, na umidade relativa e temperatura *(#4)*.

<img loading="lazy" src="/img/hq/dht11-java-results.png" title='Saída de depuração de leituras estáveis do DHT11 em Java usando gpioSetAlertFunc' alt='Saída de depuração de leituras estáveis do DHT11 em Java usando gpioSetAlertFunc'>

Você encontrará o código de demonstração completo em [https://github.com/t3rmian/rpidemo](https://github.com/t3rmian/rpidemo).
Se você quiser tentar uma solução de polling, dê uma olhada na discussão ["Unable to read DHT22 sensor"](https://github.com/Pi4J/pi4j-v2/discussions/191) no projeto *pi4j-v2*.

## Resumo

Às vezes, Java pode ser lento, mas ainda tem seus encantos.
Você pode tirar proveito do JIT ou construir uma imagem nativa com GraalVM SE ou EE com um toque de PGO.
Com o Pi4J, quando pressionado pelo tempo, você pode pular os pacotes de alta abstração e usar o *pi4j-library-pigpio* fornecido.
Os melhores resultados são frequentemente alcançados com interfaces cuidadosamente elaboradas, como os callbacks de alerta em threads do *pigpio*.
Desde que você não precise de uma implementação de sistema de tempo real rígido...

