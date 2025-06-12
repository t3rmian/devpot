---
title: ¿Es Java demasiado lento para el DHT11? Pi4Jv2 y pigpio
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

Java ciertamente no es la primera opción para sistemas embebidos, al menos no para dispositivos edge. Pero aquí estoy con un sensor de temperatura barato conectado a una Raspberry 3B con algún runtime de Java.

<img width="700" src="/img/hq/dht11.jpg" title='Sensor DHT11 conectado a la Raspberry Pi 3B' alt='Foto del sensor DHT11 conectado a la Raspberry Pi 3B'>

Además de la temperatura, el DHT11 también responde con la humedad relativa de la misma forma que su sucesor más preciso, el DHT22.
En un total de 40 bits, encontrarás dos veces 8 bits de datos enteros y decimales para humedad y temperatura, terminando con un checksum de 8 bits.

Actualmente, Pi4J es la librería más utilizada para gestionar "todo lo Java en Raspberry Pi".
Puedes encontrar ejemplos que supuestamente obtienen las mediciones del DHT11 usando Java/Pi4J directamente en Google.
En pocos minutos te das cuenta de que o bien funcionan como un wrapper para ejecutar código Python o tienen dificultades para leer la transmisión a tiempo.

## ¿Por qué? ¿Java es simplemente demasiado lento?

La característica principal de Java es que compila a bytecode, una representación intermedia que puede ejecutarse en diferentes sistemas.
Por esto, su rendimiento es relativamente más lento que una implementación nativa.
La situación cambia cuando el compilador JIT identifica áreas críticas y las optimiza compilándolas a código nativo eficiente.
De vez en cuando, el garbage collector también puede detener o ralentizar tu programa por una fracción de segundo.

La transmisión es bidireccional de un solo cable y dura unos 18 + 4 ms:

<figure>
<img src="/img/hq/dht11-transmission.jpg" alt="Proceso de comunicación DHT11" title="Gráfico del proceso de comunicación DHT11">
<figcaption><center><i>Fuente: <a href="https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf">Datasheet de Mouser</a></i></center></figcaption>
</figure>

Pero, ¿qué tiempos se requieren? Veamos:

1. El MCU (RPI) envía una señal de inicio bajando el voltaje al menos 18 ms;
2. El MCU sube el voltaje y espera la respuesta del DHT durante 20-40 µs;
3. El DHT baja el voltaje durante 80 µs;
4. El DHT sube el voltaje durante 80 µs;
5. El DHT envía 40 bits de datos:
   - El DHT baja el voltaje durante 50 µs;
   - El DHT sube el voltaje durante:
      - 26-28 µs para indicar '0';
      - 70 µs para indicar '1';
6. El DHT termina la transmisión de datos bajando el voltaje;
7. El DHT finaliza la comunicación subiendo el voltaje.

Dos restricciones de polling cruciales resultan de estos tiempos.
Debemos poder cambiar el GPIO de salida a entrada lo suficientemente rápido (180 µs) y muestrear a una tasa suficiente para distinguir la duración de la señal. ¿Qué tan rápido es suficiente?

La respuesta ya la dieron Nyquist y Shannon: <i>f<sub>s</sub> ≥ 2 × f<sub>max</sub></i>, donde:
- <i>f<sub>s</sub></i> es la tasa de muestreo (Hz);
- <i>f<sub>max</sub></i> es la frecuencia máxima del componente de la señal (Hz).

<center>
<i>f<sub>max</sub> = 1 / (26 s × 10<sup>^-6</sup>) ≈ 40 kHz</i>
<br/>
<i>f<sub>s</sub> ≥ 80 kHz = muestreo cada 12.5 µs</i>
</center>

Vamos a correr algunos benchmarks JMH para ver si es alcanzable.

## Java Microbenchmark Harness para Pi4J v2

Pi4J tuvo una segunda versión mayor recientemente, y la primera ya está discontinuada.
Una configuración simple de Maven permite compilar fácilmente, y para el entorno de desarrollo uso un PC con un target remoto (SSH) en la RPI.
Un detalle: Pi4J 2.3.0 usa la librería C *pigpio* que requiere acceso root al GPIO.

> **Nota:** Puedes habilitar el login root en la RPI, pero entonces [pierdes la opción de sigterm al proceso](https://youtrack.jetbrains.com/issue/IDEA-308213/SSH-Processes-are-not-killable-if-connected-to-root-user) usando OpenSSH. En el peor caso, puedes matarlo desde otra sesión.

Aquí la configuración esencial de Maven:
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

Seguido de la inicialización y los benchmarks de lectura.

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

En estos benchmarks, intento ver cuánto disminuye la duración tras la enésima ejecución del método (*SingleShotTime*).
Con suerte, el JIT compila algo a código nativo superrápido.

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

Para lograr menos de 12.5 µs de tiempo de lectura, el JIT necesitó menos de 100000 iteraciones.
Tendrías que usar otro modo de benchmark para estimar el tiempo mínimo de calentamiento estable, pero mi estimación sería dentro de los 10s.

## ¿Puede ayudar la compilación ahead-of-time (AOT)?

En los últimos años podemos construir una imagen nativa usando GraalVM.
Solo necesitas descargar [la VM](https://www.graalvm.org/downloads/) y usar la herramienta `native-image`.
El plugin de Maven `org.graalvm.buildtools:native-maven-plugin` facilita el proceso. Se requieren dos archivos en `META-INF/native-image`.
El `proxy-config.json` especifica las interfaces de proxy dinámico usadas por Pi4J y `jni-config.json` ayuda al compilador a enlazar el callback nativo de *pigpio* con Java.

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

Inevitablemente, el comando `mvn clean package -Pnative` consume bastante memoria (~2-3G), tiempo (~3 min) y requiere arquitectura target. 
La RAM limitada en la RPI puede compensarse aumentando el swap, pero no está pensado para builds tan largos (hasta 15 minutos).
Una alternativa es usar un servidor virtual. Por ejemplo, Oracle Cloud Infrastructure ofrece una máquina `aarch64` con recursos cómodos.

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

Ahora, en mi test poco científico, los resultados son bastante satisfactorios, salvo overhead ocasional del GC.
La inicialización parece mucho mejor que con JIT. Quizá algunas partes no estaban lo suficientemente calientes para el compilador.
```shell
Pi4Jv2 Initialization duration: 11927ns
Pi4Jv2 Read duration: 7083ns, state HIGH
```

Aquí me detuve por lo engorroso del proceso, pero hay más.
Según la [comparativa de ediciones de GraalVM de Oracle](https://www.oracle.com/a/ocom/docs/graalvm_enterprise_community_comparison_2021.pdf),
la edición CE que usé "es aproximadamente un 50% más lenta que la compilación JIT".
Sin embargo, la edición Enterprise puede ser más rápida usando [Profile-Guided Optimizations](https://www.graalvm.org/22.0/reference-manual/native-image/PGO/).
Lo menciono porque la EE puede usarse gratis en OCI. El reto sería cómo perfilar correctamente, dado que depende de la lib *pgpio*.

> El ejecutable nativo en la RPI no resuelve bien la búsqueda de la librería *libpi4j-pigpio.so*, tendrás que extraerla de `pi4j-library-pigpio-2.3.0.jar!lib/aarch64/` y pasar su ubicación con la propiedad Java `pi4j.library.path`. En OCI PGO, también faltarán las libs nativas *pigpio* que suelen venir preinstaladas en la RPI.

## Acelerando con *pi4j-library-pigpio*

Sorprendentemente, puedes saltarte una capa de Pi4J usando directamente `pi4j-library-pigpio` incluida por `pi4j-plugin-pigpio`.
Tiene menos abstracción (menos objetos, menos validaciones) y mantiene un binding directo con *pigpio*.

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

Ahora sí se ve mucho mejor. Puedes anticipar comunicación estable desde la primera señal.

## *pigpio* ultrarrápido y preciso

Como desarrollador Java, hacer polling para obtener la duración precisa de la señal no me convencía.
Me puse a buscar una interfaz que ya implementara esta información.

Revisé la documentación de *pigpio* y encontré funciones interesantes como [state alert listening](https://abyz.me.uk/rpi/pigpio/cif.html#gpioSetAlertFunc).
En Pi4J, esta función estaba oculta por una configuración de debounce de 10 µs y la falta de información de tick (tiempo de cambio de estado).
Por eso no reportaba los cambios de estado a tiempo.
Un nivel más abajo, en *pi4j-library-pigpio*, encontrarás la interfaz esperada y podrás cambiar la tasa de muestreo por defecto de 5 µs de *pigpio*.

Viendo los headers de *pigpio*, parece que hay dos hilos: uno para registrar el cambio de estado y otro para notificar al callback. Esto hace que la lectura sea ultrarrápida (hasta 1 µs) y da tiempo suficiente al callback para procesar (con un buffer/tiempo bastante generoso).
A cambio, puede haber retrasos en la notificación. Perfecto para mi caso.

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

Este enfoque permite implementar un código más legible y de alto nivel, como esperarías en Java.
Solo tienes que guardar los tiempos *(#2)* de la señal tras el registro inicial *(#1)*.
Al recibir el último bit de la transmisión, el hilo callback despierta tu hilo llamante *(#3)*.
Después puedes tomarte tu tiempo para parsear los tiempos en bits de datos y luego en humedad y temperatura *(#4)*.

<img loading="lazy" src="/img/hq/dht11-java-results.png" title='Salida de debug de lecturas estables DHT11 en Java usando gpioSetAlertFunc' alt='Salida de debug de lecturas estables DHT11 en Java usando gpioSetAlertFunc'>

Puedes ver el código demo completo en [https://github.com/t3rmian/rpidemo](https://github.com/t3rmian/rpidemo).
Si quieres probar una solución de polling, revisa la discusión ["Unable to read DHT22 sensor"](https://github.com/Pi4J/pi4j-v2/discussions/191) en el proyecto *pi4j-v2*.

## Resumen

A veces Java puede ser lento, pero sigue teniendo su encanto.
Puedes aprovechar el JIT o construir una imagen nativa con GraalVM SE o EE y algo de PGO.
Con Pi4J, si necesitas velocidad, puedes saltarte los paquetes de alta abstracción y usar *pi4j-library-pigpio*.
Los mejores resultados suelen lograrse con interfaces bien diseñadas como los callbacks de alertas con hilos de *pigpio*.
Mientras no necesites un sistema hard-real time…
