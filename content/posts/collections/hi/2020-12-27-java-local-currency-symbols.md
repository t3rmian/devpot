---
title: जावा में सभी मुद्रा प्रतीक कैसे प्राप्त करें
url: जावा-स्थानीय-मुद्रा-प्रतीक
id: 46
category:
- java: जावा
tags:
- जेवीएम
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

जावा में मुद्राओं को प्रदर्शित करना उतना आसान नहीं है जितना लग सकता है, खासकर जब हम उसके कोड के बजाय स्थानीय मुद्रा प्रतीक प्रदर्शित करना चाहते हैं। मुद्राओं को संभालने वाली आधार कक्षाएं `java.util.Currency` और `java.util.Locale` हैं। प्रत्येक उपलब्ध मुद्रा का नाम, प्रतीक और कोड प्रदर्शित करने के लिए, इस समस्या के प्रति हमारा पहला दृष्टिकोण इस तरह दिख सकता है:

```java
class Scratch {

    public static final String CURRENCY_DISPLAY_FORMAT = "Display name: %s, symbol: %s, code: %s, numericCode: %s";

    private static String formatCurrency(Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(), currency.getSymbol(), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }

    public static void main(String[] args) {
        System.out.println("================ Currencies displayed with DISPLAY Locale ================");
        System.out.println(Currency.getAvailableCurrencies()
                .stream()
                .map(Scratch::formatCurrency)
                .collect(Collectors.joining(System.lineSeparator()))
        );
    }

}
```

एक बहुत ही सुविधाजनक विधि `Currency.getAvailableCurrencies()` से शुरू करते हुए, हम JRE द्वारा प्रदान की गई सभी मुद्राएं प्राप्त कर सकते हैं। फिर हम प्रत्येक को परिभाषित प्रारूप के अनुसार प्रदर्शित करते हैं। दुर्भाग्य से, कई मामलों में हमें अपेक्षित प्रतीक नहीं मिलेंगे:

```plaintext
...
Display name: Norwegian Krone, symbol: NOK, code: NOK, numericCode: 578
Display name: Indonesian Rupiah, symbol: IDR, code: IDR, numericCode: 360
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: PHP, code: PHP, numericCode: 608
...
```

NOK के लिए, स्थानीय प्रतीक "kr" होगा, रुपिया के लिए "Rp", आदि। यह परिणाम निश्चित रूप से प्रलेखन के अनुसार मान्य है:
> डिफ़ॉल्ट DISPLAY लोकेल के लिए इस मुद्रा का प्रतीक प्राप्त करता है।  
> उदाहरण के लिए, अमेरिकी डॉलर के लिए, यदि डिफ़ॉल्ट लोकेल यूएस है तो प्रतीक "$" है, जबकि अन्य लोकेल के लिए यह "US$" हो सकता है।  
> यदि कोई प्रतीक निर्धारित नहीं किया जा सकता है, तो ISO 4217 मुद्रा कोड लौटाया जाता है।

## स्थानीय मुद्रा प्रतीक

हम जो प्रतीक चाहते हैं उसे प्राप्त करने के लिए, हमें एक ओवरलोडेड विधि का उपयोग करने की आवश्यकता है – `public String getSymbol(Locale locale)`। इसके अलावा, यहां कोई भी *Locale* पास करना पर्याप्त नहीं है, क्योंकि हमें संभवतः एक समान परिणाम मिलेगा। यदि हम किसी दिए गए देश का स्थानीय मुद्रा प्रतीक प्रदर्शित करना चाहते हैं, तो हमें उसी देश का *Locale* पास करना होगा। इस तरह का संबंध *Locale* – *Currency*, निम्नलिखित कोड के साथ बनाया जा सकता है:

```java
    private static Currency getLocaleCurrency(Locale locale) {
        try {
            return Currency.getInstance(locale);
        } catch (IllegalArgumentException iae) {
            System.err.printf("For locale: %s, %s; country code: %s is not a supported ISO 3166 country code%n",
                    locale.getDisplayName(), locale, locale.getCountry());
            return null;
        }
    }
```

इस मामले में, हम `Locale.getAvailableLocales()` विधि से JRE द्वारा समर्थित सभी लोकेल की एक सूची प्राप्त करेंगे। हालाँकि, इस सूची में ऐसे लोकेल भी शामिल हैं जो `Currency.getInstance()` विधि द्वारा समर्थित नहीं हैं – ऐसे मामले में, एक *IllegalArgumentException* फेंका जाएगा। उदाहरणों में ऐसे लोकेल शामिल हैं जो केवल भाषा को परिभाषित करते हैं, विशिष्ट देश कोड के बिना:

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: English (Europe), en_150; country code: 150 is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

लोकेल को मुद्राओं से जोड़ने के बाद, हमें बस अपनी स्वरूपण को समायोजित करने की आवश्यकता है:

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

और अंतिम कोड इस तरह दिखेगा:

```java
    public static void main(String[] args) {
        System.out.println("================ Currencies displayed with local Locale ================");
        System.out.println(Arrays.stream(Locale.getAvailableLocales())
                .collect(HashMap<Locale, Currency>::new,
                        (map, locale) -> map.put(locale, getLocaleCurrency(locale)), HashMap<Locale, Currency>::putAll)
                .entrySet()
                .stream()
                .filter(entry -> entry.getValue() != null)
                .map(entry -> formatCurrency(entry.getKey(), entry.getValue()))
                .collect(Collectors.joining(System.lineSeparator()))
        );
    }
```

स्ट्रीम मानों को मैप करने के लिए, *collect* विधि के पैरामीटर के रूप में, हमें *supplier*, *accumulator* और *combiner* के मैन्युअल रूप से निर्मित मान प्रदान करने होंगे। हम यहां `java.util.stream.Collectors.toMap()` का उपयोग नहीं कर सकते, क्योंकि यह संग्राहक *null* मानों का समर्थन नहीं करता है जो हमारे मामले में अपेक्षित हैं।

अंत में, अपेक्षित मुद्रा प्रतीक हमारे कंसोल में दिखाई देने चाहिए:

```plaintext
...
Display name: norske kroner, symbol: kr, code: NOK, numericCode: 578
Display name: Rupiah Indonesia, symbol: Rp, code: IDR, numericCode: 360
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: ₱, code: PHP, numericCode: 608
...
```

और वैकल्पिक डी-डुप्लीकेशन के बाद, एक नमूना एप्लिकेशन में:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-currency.png" alt="मुद्रा प्रतीक विकल्प प्रदर्शित करने वाली विंडो का स्क्रीनशॉट" title="NutrieVal – पसंदीदा मुद्रा का चयन">
</a>
</figure>

## CVE – केप वर्डी एस्कूडो

ऐसा लगता है कि केवल एक मुद्रा – [केप वर्डी एस्कूडो](https://en.wikipedia.org/wiki/Cape_Verdean_escudo) – सही प्रतीक प्रदर्शित नहीं करती है। तथाकथित [सिफ्राओ](https://en.wikipedia.org/wiki/Cifr%C3%A3o) (कोई यूनिकोड समकक्ष नहीं) या "Esc" के बजाय, एक खाली पाठ प्रदर्शित होता है। वास्तव में, दो वर्ण लौटाए जाते हैं, जो ASCII कोड तालिका पर आधारित होते हैं – एक *ऊर्ध्वाधर टैब* जिसके बाद एक *क्षैतिज स्थान* होता है:

<img src="/img/hq/java-cve-escudo.png" alt="डीबगर से स्क्रीनशॉट" title="डीबगर से स्क्रीनशॉट">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)
