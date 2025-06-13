---
title: क्या Java, DHT11 के लिए बहुत धीमी है? Pi4Jv2 और pigpio
url: dht11-जावा-pi4j-पिगपिओ
id: 113
category:
- java: जावा
tags:
- आरपीआई
- डीएचटी11
- पाई4जे
- पिगपिओ
- एम्बेडेड
- जेएमएच
author: Damian Terlecki
date: 2023-06-30T20:00:00
source: https://github.com/t3rmian/rpidemo
---

जावा निश्चित रूप से एम्बेडेड के लिए पहली पसंद नहीं है, कम से कम एज डिवाइस के लिए तो नहीं। लेकिन यहाँ मैं एक
सस्ते तापमान सेंसर के साथ हूँ जो कुछ जावा रनटाइम के साथ एक रास्पबेरी 3B से जुड़ा है।

<img width="700" src="/img/hq/dht11.jpg" title='DHT11 सेंसर रास्पबेरी पाई 3B से जुड़ा हुआ है' alt='DHT11 सेंसर की तस्वीर जो रास्पबेरी पाई 3B से जुड़ी है'>

तापमान के अलावा, DHT11
सापेक्ष आर्द्रता के साथ भी प्रतिक्रिया करता है, उसी तरह जैसे इसका अधिक सटीक उत्तराधिकारी DHT22 करता है।
कुल 40 बिट्स के भीतर, आपको आर्द्रता और तापमान के लिए दो बार 8बिट इंटीग्रल और दशमलव डेटा मिलेगा, जो 8बिट चेक-सम के साथ समाप्त होता है।

वर्तमान में, Pi4J "रास्पबेरी पाई पर सभी जावा चीजों" के प्रबंधन के लिए सबसे व्यापक रूप से उपयोग की जाने वाली लाइब्रेरी के रूप में खड़ा है।
आप कुछ उदाहरणों पर आ सकते हैं जो सीधे Google में जावा/Pi4J का उपयोग करके DHT11 से माप प्राप्त करने वाले हैं।
यह महसूस करने में कुछ मिनट लगते हैं कि वे या तो पायथन कोड निष्पादित करने के लिए एक रैपर के रूप में कार्य करते हैं या समय पर प्रसारण को पढ़ने में कठिनाइयों का सामना करते हैं।

## ऐसा क्यों है? क्या जावा बस बहुत धीमी है?

जावा की प्रमुख विशेषता यह है कि यह बाइटकोड में संकलित होती है जो एक मध्यवर्ती प्रतिनिधित्व है जिसे विभिन्न
सिस्टम पर चलाया जा सकता है।
इस वजह से, इसका प्रदर्शन देशी कार्यान्वयन की तुलना में अपेक्षाकृत धीमा है।
स्थिति तब बदल जाती है जब JIT कंपाइलर प्रदर्शन-महत्वपूर्ण क्षेत्रों की पहचान करता है और उन्हें अत्यधिक कुशल देशी कोड में संकलित करके अनुकूलित करता है।
अब और तब, कुछ कचरा संग्रह भी
आपके कार्यक्रम को एक छोटे से सेकंड के लिए रोक देगा या धीमा कर देगा।

ट्रांसमिशन सिंगल-वायर टू-वे है और कहा जाता है कि यह लगभग 18 + 4 एमएस तक चलता है:

<figure>
<img src="/img/hq/dht11-transmission.jpg" alt="DHT11 संचार प्रक्रिया" title="DHT11 संचार प्रक्रिया ग्राफ">
<figcaption><center><i>स्रोत: <a href="https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf">Mouser's Datasheet</a></i></center></figcaption>
</figure>

लेकिन क्या समय की आवश्यकता है? चलिए देखते हैं:

1. एमसीयू (आरपीआई) कम से कम 18 एमएस के लिए वोल्टेज को नीचे खींचकर एक स्टार्ट सिग्नल भेजता है;
2. एमसीयू वोल्टेज को ऊपर खींचता है और 20-40 µs के लिए डीएचटी प्रतिक्रिया की प्रतीक्षा करता है;
3. डीएचटी 80 µs के लिए वोल्टेज को नीचे खींचता है;
4. डीएचटी 80 µs के लिए वोल्टेज को ऊपर खींचता है;
5. डीएचटी 40 बिट डेटा भेजता है:
  - डीएचटी 50 µs के लिए वोल्टेज को नीचे खींचता है;
  - डीएचटी या तो वोल्टेज को ऊपर खींचता है:
    - 26-28 µs '0' को दर्शाता है या;
    - 70 µs '1' बिट को इंगित करता है;
6. डीएचटी वोल्टेज को नीचे खींचकर डेटा ट्रांसमिशन समाप्त करता है;
7. डीएचटी वोल्टेज को ऊपर खींचकर संचार समाप्त करता है।

इन समयों से दो महत्वपूर्ण मतदान बाधाएं उत्पन्न होती हैं।
हमें जीपीआईओ को आउटपुट से इनपुट (180 µs) में पर्याप्त तेजी से स्विच करने में सक्षम होना चाहिए और सिग्नल की अवधि को अलग करने के लिए पर्याप्त तेज दर पर नमूना लेना चाहिए।
आप पूछ सकते हैं कि क्या काफी तेज है?

उत्तर पहले से ही नाइक्विस्ट और शैनन द्वारा दिया गया था, और यह <i>f<sub>s</sub> ≥ 2 × f<sub>max</sub></i> है, जहाँ:
- <i>f<sub>s</sub></i> नमूना दर है (नमूने प्रति सेकंड या हर्ट्ज में);
- <i>f<sub>max</sub></i> सिग्नल में उच्चतम आवृत्ति घटक है (हर्ट्ज में)।

<center>
<i>f<sub>max</sub> = 1 / (26 s × 10<sup>^-6</sup>) ≈ 40 kHz</i>
<br/>
<i>f<sub>s</sub> ≥ 80 kHz = प्रत्येक 12.5 µs पर नमूना लें</i>
</center>

चलिए कुछ JMH बेंचमार्क चलाते हैं यह देखने के लिए कि क्या यह प्राप्त करने योग्य है।

## Pi4J v2 के लिए जावा माइक्रोबेंचमार्क हार्नेस

Pi4J का हाल ही में दूसरा बड़ा रिलीज हुआ, और पहला संस्करण तब से बंद कर दिया गया था।
एक साधारण मावेन सेटअप निर्बाध निर्माण को सक्षम करता है, और विकास के माहौल के लिए, मैं एक रिमोट (SSH) RPI रन लक्ष्य के साथ एक पीसी का उपयोग करता हूं।
एक चेतावनी यह है कि Pi4J 2.3.0 एक सी लाइब्रेरी *pigpio* का उपयोग करता है जिसे GPIO तक रूट एक्सेस की आवश्यकता होती है।

> **ध्यान दें:** आप RPI पर रूट लॉगिन को सक्षम कर सकते हैं, लेकिन तब आप अंतर्निहित OpenSSH का उपयोग करते समय [प्रक्रिया को सिग्नल करने का विकल्प खो देते हैं](https://youtrack.jetbrains.com/issue/IDEA-308213/SSH-Processes-are-not-killable-if-connected-to-root-user)। सबसे खराब स्थिति में, आप इसे एक अलग सत्र से मारने की कोशिश कर सकते हैं।

यहाँ आवश्यक मावेन परियोजना कॉन्फ़िग है:
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

इसके बाद इनिशियलाइज़ेशन और रीड बेंचमार्क हैं।

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

इन बेंचमार्क में, मैं यह विचार प्राप्त करने की कोशिश कर रहा हूं कि विधि के nवें निष्पादन (*सिंगलशॉटटाइम* मोड) के बाद अवधि कितनी कम हो जाएगी।
उम्मीद है, JIT कुछ सामान को सुपरफास्ट देशी कोड में संकलित करने का फैसला करता है।

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

12.5 µs से कम पढ़ने की अवधि का समय प्राप्त करने के लिए, JIT कंपाइलर को कहीं 100000 से कम पुनरावृत्तियों का समय लगा।
स्थिर पढ़ने वार्म-अप के लिए न्यूनतम समय का अनुमान लगाने के लिए आपको एक अलग बेंचमार्क मोड चलाना होगा, लेकिन मेरा अनुमानित अनुमान 10 सेकंड के भीतर होगा।

## क्या अहेड-ऑफ-टाइम (AOT) संकलन मदद कर सकता है?

हाल के वर्षों ने हमें GraalVM का उपयोग करके एक देशी छवि बनाने का अवसर दिया है।
आपको बस [वीएम](https://www.graalvm.org/downloads/) डाउनलोड करना है और `native-image` टूल का उपयोग करना है।
मावेन `org.graalvm.buildtools:native-maven-plugin` इस प्रक्रिया को सुव्यवस्थित करता है। इस प्रक्रिया के लिए `META-INF/native-image` में दो फ़ाइलों की अतिरिक्त आवश्यकता होती है।
`proxy-config.json` Pi4J द्वारा उपयोग किए जाने वाले गतिशील प्रॉक्सी इंटरफेस को निर्दिष्ट करता है और `jni-config.json` कंपाइलर को देशी *पिगपिओ* कॉलबैक को जावा से जोड़ने में मदद करता है।

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

अपरिहार्य रूप से, `mvn clean package -Pnative` में काफी मात्रा में मेमोरी (~2-3G), समय (~3 मिनट) और लक्ष्य वास्तुकला होस्ट लगता है।
RPI पर सीमित RAM संसाधनों को स्वैप बढ़ाकर दूर किया जा सकता है, लेकिन यह वास्तव में ऐसे कार्यभार के लिए अभिप्रेत नहीं है कि निर्माण अवधि 15 मिनट तक पहुंच जाए।
एक विकल्प एक वर्चुअल सर्वर का उपयोग करना है। उदाहरण के लिए, Oracle क्लाउड इन्फ्रास्ट्रक्चर एक `aarch64` बॉक्स प्रदान करता है जिसमें आरामदायक मात्रा में मुफ्त संसाधन होते हैं।

```java
### ओसीआई
---------------------------------------------------------------------------
  3.2s (कुल समय का 1.6%) 24 जीसी में | पीक आरएसएस: 2.22 जीबी | सीपीयू लोड: 0.96
---------------------------------------------------------------------------
3m 24s में 'rpidemo' उत्पन्न करना समाप्त हुआ।

### आरपीआई 3बी
---------------------------------------------------------------------------
108.4s (कुल समय का 12.0%) 102 जीसी में | पीक आरएसएस: 0.77 जीबी | सीपीयू लोड: 2.81
---------------------------------------------------------------------------
14m 55s में 'rpidemo' उत्पन्न करना समाप्त हुआ।
```

अब मेरे अवैज्ञानिक परीक्षण पर जाएं, तो परिणाम उल्लेखनीय रूप से संतोषजनक हैं, कचरा संग्रह के सामयिक ओवरहेड को छोड़कर।
निश्चित रूप से, आरंभीकरण का समय JIT के साथ बहुत बेहतर लगता है। शायद कुछ हिस्से कंपाइलर को ट्रिगर करने के लिए पर्याप्त गर्म नहीं थे?
```shell
Pi4Jv2 Initialization duration: 11927ns
Pi4Jv2 Read duration: 7083ns, state HIGH
```

इस बिंदु पर मैं प्रक्रिया की बोझिलता के कारण रुक गया, लेकिन और भी बहुत कुछ है।
[Oracle के GraalVM संस्करण सुविधा और लाभ तुलना](https://www.oracle.com/a/ocom/docs/graalvm_enterprise_community_comparison_2021.pdf) के अनुसार,
CE संस्करण जिसका मैंने उपयोग किया है "JIT संकलन से लगभग 50% धीमा है"।
हालांकि, GraalVM एंटरप्राइज संस्करण संकलित देशी निष्पादन योग्य [प्रोफ़ाइल-निर्देशित अनुकूलन](https://www.graalvm.org/22.0/reference-manual/native-image/PGO/) का उपयोग करके JIT से तेज़ हो सकते हैं।
मैं इसका उल्लेख कर रहा हूं क्योंकि EE का उपयोग OCI पर मुफ्त में किया जा सकता है। चेतावनी यह होगी कि इसे ठीक से कैसे प्रोफ़ाइल-निर्देशित किया जाए, *pgpio* लिब पर निर्भरता को देखते हुए।

> RPI पर देशी निष्पादन योग्य *libpi4j-pigpio.so* बाइंडिंग लाइब्रेरी के लुकअप को अच्छी तरह से नहीं संभालता है, आपको इसे `pi4j-library-pigpio-2.3.0.jar!lib/aarch64/` से अनपैक करना होगा और जावा सिस्टम प्रॉपर्टी `pi4j.library.path` का उपयोग करके इसका स्थान प्रदान करना होगा। दूसरी ओर, OCI PGO के लिए, आपको देशी *pigpio* लिब भी याद आ रही होगी जो आमतौर पर RPI पर पहले से इंस्टॉल होती हैं।

## *pi4j-library-pigpio* के साथ गति बढ़ाना

आश्चर्यजनक रूप से, आप `pi4j-plugin-pigpio` द्वारा शामिल `pi4j-library-pigpio` का सीधे उपयोग करके Pi4J की एक परत को छोड़ सकते हैं।
इसमें बहुत कम अमूर्तता (निम्न-स्तरीय, कम ऑब्जेक्ट निर्माण कम सत्यापन) है और *pigpio* के लिए एक तंग बंधन बनाए रखता है।

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

जेएमएच:
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

अब यह बहुत बेहतर लग रहा है। आप पहले सिग्नल से स्थिर संचार की उम्मीद कर सकते हैं।

## धधकता सटीक *pigpio*

एक जावा डेवलपर के रूप में, सिग्नल की सटीक अवधि प्राप्त करने के लिए मतदान करना मेरे साथ ठीक नहीं बैठा।
बीच में, मैंने एक इंटरफ़ेस की तलाश शुरू की जो पहले से ही इस जानकारी को लागू करता है।

मैंने *pigpio* के लिए दस्तावेज़ीकरण देखा और कुछ आशाजनक कार्य पाए जैसे [राज्य चेतावनी सुनना](https://abyz.me.uk/rpi/pigpio/cif.html#gpioSetAlertFunc)।
Pi4J में, यह फ़ंक्शन एक डिफ़ॉल्ट 10 µs डिबाउंस कॉन्फ़िगरेशन द्वारा छिपा हुआ था, जो लापता टिक (स्टेट स्विच टाइम) जानकारी के साथ संयुक्त था।
यही कारण है कि यह समय पर राज्य परिवर्तनों की रिपोर्ट नहीं कर रहा था।
*pi4j-library-pigpio* में एक स्तर नीचे, आपको अपेक्षित इंटरफ़ेस मिलेगा, साथ ही आप डिफ़ॉल्ट 5 µs *pigpio* नमूना दर को बदलने में सक्षम होंगे।

*pigpio* हेडर परिभाषाओं में और देखने पर, ऐसा लगता है कि दो थ्रेड हैं।
एक राज्य परिवर्तन को पंजीकृत करने के लिए है, और दूसरा कॉलबैक को रिपोर्ट करने के लिए है। यह पढ़ने को धधकता सटीक बनाता है (यहां तक ​​कि 1 µs तक), साथ ही प्रसंस्करण के लिए कॉलबैक को पर्याप्त समय प्रदान करता है (काफी उदार बफर/समय के भीतर)।
रिपोर्टिंग में संभावित देरी के लिए कारोबार किया। मेरे मामले के लिए बिल्कुल सही।

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

यह दृष्टिकोण एक अधिक पठनीय, उच्च-स्तरीय कोड के कार्यान्वयन की अनुमति देता है जो आप आमतौर पर जावा में उम्मीद करेंगे।
आपको बस प्रारंभिक पंजीकरण * (#1)* के बाद सिग्नल के समय * (#2)* को सहेजना है।
ट्रांसमिशन का अंतिम बिट प्राप्त होने पर, कॉलबैक थ्रेड आपके कॉलिंग थ्रेड * (#3)* को जगाता है।
उसके बाद, आप सिग्नल समय को डेटा बिट्स में और फिर सापेक्ष आर्द्रता और तापमान * (#4)* में पार्स करने के लिए अपना समय ले सकते हैं।

<img loading="lazy" src="/img/hq/dht11-java-results.png" title='gpioSetAlertFunc का उपयोग करके स्थिर DHT11 जावा रीड्स का डीबग आउटपुट' alt='gpioSetAlertFunc का उपयोग करके स्थिर DHT11 जावा रीड्स का डीबग आउटपुट'>

आपको पूरा डेमो कोड [https://github.com/t3rmian/rpidemo](https://github.com/t3rmian/rpidemo) पर मिलेगा।
यदि आप एक मतदान समाधान आज़माना चाहते हैं, तो *pi4j-v2* प्रोजेक्ट पर ["Unable to read DHT22 sensor"](https://github.com/Pi4J/pi4j-v2/discussions/191) चर्चा पर एक नज़र डालें।

## सारांश

कभी-कभी जावा धीमी हो सकती है, लेकिन इसमें अभी भी अपना आकर्षण है।
आप JIT का लाभ उठा सकते हैं या GraalVM SE या EE के साथ PGO के कुछ छिड़काव के साथ देशी छवि बना सकते हैं।
Pi4J के साथ जब समय के लिए दबाव डाला जाता है, तो आप उच्च-अमूर्तता पैकेज को छोड़ सकते हैं और प्रदान किए गए *pi4j-library-pigpio* का उपयोग कर सकते हैं।
सबसे अच्छे परिणाम अक्सर विचारपूर्वक तैयार किए गए इंटरफेस जैसे *पिगपिओ* थ्रेडेड अलर्ट कॉलबैक के साथ प्राप्त होते हैं।
जब तक आपको हार्ड-रियल टाइम सिस्टम कार्यान्वयन की आवश्यकता नहीं है…

