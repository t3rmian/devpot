---
title: उदाहरणों के साथ Maven शेड प्लगइन का PropertiesTransformer
url: मैवेन-शेड-प्लगइन-प्रॉपर्टीज़-ट्रांसफार्मर
id: 112
category:
- java: जावा
tags:
- मैवेन
- मैवेन-शेड-प्लगइन
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

Maven Shade Plugin एक एक्सटेंशन है जो आपको प्रोजेक्ट बिल्ड प्रक्रिया के दौरान निर्भरताओं को संयोजित करने की अनुमति देता है। इस
प्लगइन का उद्देश्य एक JAR फ़ाइल बनाना है जिसमें सभी एप्लिकेशन निर्भरताएँ और उसका कोड शामिल हो।

इस प्रक्रिया के भीतर, कॉन्फ़िगरेशन फ़ाइलों, जैसे कि `*.properties`, को मर्ज करना कभी-कभी समस्याग्रस्त हो सकता है। डिफ़ॉल्ट रूप से,
अंतिम सामना की गई फ़ाइल परिणामी आर्टिफैक्ट में अपनी जगह जीत लेगी।
प्लगइन ऐसी समस्याओं को हल करने और संसाधन मर्जिंग के व्यवहार को प्रभावित करने के लिए तथाकथित ट्रांसफॉर्मर का उपयोग करके कॉन्फ़िगरेशन प्रदान करता है।

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='Maven शेड प्लगइन संसाधनों के ओवरलैप की रिपोर्ट कर रहा है' alt='Maven शेड प्लगइन संसाधनों के ओवरलैप की रिपोर्ट कर रहा है'>

## *PropertiesTransformer* ट्रांसफॉर्मेशन

प्लगइन स्वयं कई पूर्व-स्थापित ट्रांसफॉर्मर प्रदान करता है। अधिक जटिल वाले आप बाहरी प्रदाताओं से आयात कर सकते हैं। संस्करण 3.2.2 के बाद से, डेवलपर्स ने `org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`
का एक कार्यान्वयन भी प्रदान किया है।
जब आपको गुणों को संयोजित करने के क्रम को बदलने की आवश्यकता होती है तो इसका नाम काफी आशाजनक लग सकता है।
आप यह चाह सकते हैं कि एप्लिकेशन पसंदीदा (आमतौर पर ओवरराइड) गुणों को लोड करे।

यदि आप [*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)
पर एक नज़र डालें और उदाहरण कॉन्फ़िगरेशन (नीचे संदर्भित) का प्रयास करें, तो आपको अपने अपेक्षित परिणाम तक पहुँचने में कठिनाई हो सकती है।
गुणों की व्याख्या थोड़ी सतही लग सकती है, यही कारण है कि उदाहरणों पर व्यवहार को देखना सबसे अच्छा है
([संस्करण 3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java))।

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- आवश्यक कॉन्फ़िगरेशन -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- वैकल्पिक कॉन्फ़िगरेशन -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

क्रमशः मॉड्यूल A और मॉड्यूल B से दो `configuration/application.properties` फ़ाइलें होने पर:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
*maven-shade-plugin* का *shade* लक्ष्य *PropertiesTransformer* के साथ दोनों निर्भरताओं को संयोजित करने पर डिफ़ॉल्ट रूप से निम्नलिखित `configuration/application.properties` फ़ाइल का उत्पादन करेगा:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***


### *ordinalKey* और *defaultOrdinal*

फ़ाइलों को जिस क्रम में मर्ज किया जाएगा, वह `ordinalKey` द्वारा नियंत्रित होता है जो उस प्रॉपर्टी के नाम की ओर इशारा करता है
जिसका मान संख्यात्मक क्रम है। यदि प्रॉपर्टीज़ फ़ाइल में ऐसी कोई कुंजी नहीं है, तो उसका क्रम `defaultOrdinal` (गायब होने पर 0) द्वारा परिभाषित किया गया है।
मॉड्यूल A फ़ाइल में डिफ़ॉल्ट से अधिक क्रम को परिभाषित करके:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```

आउटपुट में, आपको मॉड्यूल A से प्रॉपर्टी `prop2` मिलेगी, यानी, प्रभावी रूप से उल्टे क्रम को प्राप्त करना।
इसके अतिरिक्त, ट्रांसफार्मर कृत्रिम कुंजी को हटा देगा:

```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

`alreadyMergedKey` एक `boolean` मान प्रकार (जैसे, एक `true` *String*) प्रॉपर्टी नाम को परिभाषित करता है जो फ़ाइल प्राथमिकता को इंगित करता है।
इस तरह, ट्रांसफार्मर अन्य फ़ाइलों को इस फ़ाइल में मर्ज नहीं करेगा।

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
ऐसी प्रॉपर्टीज़ के लिए, आपको मॉड्यूल A से प्रॉपर्टीज़ की एक प्रति मिलेगी, फिर से `already_merged` सिंथेटिक कुंजी को हटा दिया गया है:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

एक से अधिक फ़ाइलों में `true` मान के साथ ऐसी कुंजी की घटना की अनुमति नहीं है और इसके परिणामस्वरूप एक त्रुटि होगी।

***


### *reverseOrder*

फ़ाइलों को संयोजित करने के क्रम को उलटने के लिए आप `reverseOrder` विकल्प का उपयोग कर सकते हैं। दुर्भाग्य से, यह सुविधा
समान क्रम मान वाली फ़ाइलों के बीच के क्रम को नहीं उलटती है। यानी, `<reverseOrder>true</reverseOrder>` और दो के लिए
प्रॉपर्टी फ़ाइलें:

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
आपको अभी भी ( `reverseOrder` के मान की परवाह किए बिना) वही परिणाम मिलेगा:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

उलटा केवल `ordinalKey` के साथ क्रम को परिभाषित करने के बाद और केवल एक अलग क्रम की फ़ाइलों के बीच काम करता है।

***

## सारांश

`PropertiesTransformer` प्रॉपर्टी फ़ाइलों के बुनियादी विलय की अनुमति देता है। यह जानना उचित है कि फ़ाइलें शुरू में `java.util.Properties`
का उपयोग करके लोड की जाती हैं। इसका मतलब है कि डुप्लिकेट को उसी फ़ाइल के भीतर सबसे हाल की (नीचे के सबसे करीब) प्रॉपर्टी से अधिलेखित कर दिया जाता है।

फ़ाइल विलय के क्रम को निर्धारित करने या कई फ़ाइलों के बीच एक प्राथमिकता फ़ाइल नामित करने के लिए, आपको एक कृत्रिम कुंजी शामिल करनी होगी।
अफसोस की बात है कि समान या डिफ़ॉल्ट क्रम मान वाली फ़ाइलों के बीच क्रम को उलटना संभव नहीं है।

इसलिए यदि आपको थोड़ी अलग मर्जिंग व्यवहार की आवश्यकता है (उदाहरण के लिए, कृत्रिम कुंजी जोड़ने की आवश्यकता के बिना), तो कस्टम ट्रांसफॉर्मर के साथ बाहरी ऐड-ऑन पैक देखें।
आप `<plugin></plugin>` टैग के अंदर `<dependencies></dependencies>` टैग का उपयोग करके आसानी से ऐसी निर्भरता जोड़ सकते हैं।
यदि आप बस गुणों को उल्टे क्रम में संयोजित करना चाहते हैं, तो
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0) पर एक नज़र डालें।

