---
title: WebLogic फ़िल्टरिंग क्लासलोडर के लिए टिप्स
url: वेबलॉजिक-लाइब्रेरी-विरोधाभास
id: 92
category:
- jee: जेईई
tags:
- classloading
- weblogic
author: Damian Terlecki
date: 2022-08-07T20:00:00
---

यदि आप WebLogic को आपके एप्लिकेशन के साथ बंडल की गई निर्भरताओं का एक विशिष्ट संस्करण लोड करने का कोई तरीका ढूंढ रहे हैं, तो यहाँ आपकी समझदारी बनाए रखने के लिए कुछ युक्तियाँ दी गई हैं:
1. WebLogic एक एप्लिकेशन सर्वर के रूप में बहुत सारी लाइब्रेरियों के साथ आता है जिनका उपयोग आप अपने एप्लिकेशन में भी कर सकते हैं (संभवतः उनके विभिन्न संस्करण)।
2. WebLogic क्लास लोडिंग के दौरान मानक पैरेंट डेलीगेशन का पालन करता है। अनुरोधित क्लास को पहले सिस्टम द्वारा, फिर पैरेंट और एप्लिकेशन क्लास लोडर द्वारा देखा (पसंदीदा) जाता है।
3. फ़िल्टरिंग क्लास लोडर WebLogic में एक सुविधा है जो डिप्लॉयर को इस प्रक्रिया को प्रभावित करने और इसके कुछ हिस्सों को उलटने की अनुमति देती है। इसके साथ, आप Tomcat के समान लोडिंग प्राप्त कर सकते हैं।

आप फ़िल्टरिंग क्लास लोडर का उपयोग तब कर सकते हैं जब आप WAR एप्लिकेशन या EAR एप्लिकेशन को डिप्लॉय करते हैं। आर्काइव प्रकार के आधार पर दो अलग-अलग डिस्क्रिप्टर का उपयोग किया जाता है:
- weblogic-application.xml (EAR);
- weblogic.xml (WAR).

## EAR डिस्क्रिप्टर

EAR डिस्क्रिप्टर के लिए, आपको [स्कीमा संस्करण सूची](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-application/index.html) के आधार पर एक मेल खाने वाली XML स्कीमा परिभाषा मिलेगी।
`xsi:schemaLocation` मैपिंग को अपने WLS से मेल खाने वाले संस्करण से बदलें। अब डिस्क्रिप्टर पर चलते हैं,
महत्वपूर्ण सेटिंग्स `prefer-application-packages` और `prefer-application-resources` हैं।

पहले वाले का उपयोग उन क्लास को कॉन्फ़िगर करने के लिए किया जाता है जिन्हें WLS मॉड्यूल के बजाय आपके एप्लिकेशन से लोड किया जाना चाहिए। दूसरी प्रॉपर्टी का उपयोग गैर-क्लास संसाधनों जैसे सर्विस लोडर कॉन्फ़िगरेशन फ़ाइलों के लिए किया जा सकता है।

नीचे आप देख सकते हैं कि WLS 12.1.3 (*wlserver/<wbr>modules/<wbr>features/<wbr>weblogic.server.merged.jar*) के साथ बंडल किए गए `commons-io:commons-io` पैकेज को कैसे ओवरराइड किया जाए,
साथ ही एप्लिकेशन वाले के साथ JAX-RS (WLS 12.2) के लिए एक कार्यान्वयन प्रदाता भी:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-application
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-application"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-application http://xmlns.oracle.com/weblogic/weblogic-application/1.8/weblogic-application.xsd">

    <prefer-application-packages>
        <package-name>org.apache.commons.io.*</package-name>
    </prefer-application-packages>
    <prefer-application-resources>
        <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
    </prefer-application-resources>

</weblogic-application>
```

इस डिस्क्रिप्टर के लिए सही स्थान `EAR/META-INF/weblogic-application.xml` है। डिफ़ॉल्ट रूप से, यदि आप इसे `src/main/application/META-INF/weblogic-application.xml` में डालते हैं,
`maven-ear-plugin` उक्त डायरेक्टरी में बंडल हो जाएगा। अन्यथा, प्लगइन `earSourceDirectory` कॉन्फ़िगरेशन प्रॉपर्टी उस स्थान को परिभाषित करती है जहां आपको `META-INF` डायरेक्टरी रखनी चाहिए।

## WAR डिस्क्रिप्टर

`weblogic.xml` के लिए स्कीमा स्थान भी [WLS संस्करण के लिए विशिष्ट](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html) है।
ध्यान दें कि WLS 12.1.3 के बाद से, EAR डिस्क्रिप्टर की तुलना में एक संस्करण ऑफ़सेट भी है।
हालांकि स्कीमा अलग है, कॉन्फ़िगरेशन उपरोक्त के समान है:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-application-packages>
            <package-name>org.apache.commons.io.*</package-name>
        </prefer-application-packages>
        <prefer-application-resources>
            <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
        </prefer-application-resources>
    </container-descriptor>
</weblogic-web-app>
```

इस बार डिस्क्रिप्टर को `WAR/WEB-INF/weblogic.xml` में जाना चाहिए। `maven-war-plugin` के साथ, यह डिफ़ॉल्ट रूप से `src/main/webapp/WEB-INF/weblogic.xml` से उठाया जाएगा।

WAR डिप्लॉयमेंट के साथ एक अतिरिक्त कॉन्फ़िगरेशन संभव है। मान लीजिए कि आपके पैकेज क्लास और निर्भरताओं के बीच क्लास संस्करणों में टकराव है।
ऐसे मामले में आप क्लास लोडर को निर्भरताओं या WLS से क्लास पर अपनी क्लास को प्राथमिकता देने के लिए मजबूर कर सकते हैं:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-web-inf-classes>true</prefer-web-inf-classes>
    </container-descriptor>
</weblogic-web-app>
```

इस विकल्प को `prefer-application-packages`/`prefer-application-resources` के साथ मिलाना मान्य नहीं है।

## समस्या निवारण (Troubleshooting)

आप सोच रहे होंगे कि क्या सही क्लास/संसाधन रनटाइम के दौरान ठीक से लोड किए गए हैं।
अक्सर, टकराव का एक स्पष्ट संकेत `java.lang.NoSuchMethodError` अपवाद होता है।
यह रनटाइम के दौरान प्रकट होता है, यह संकेत देता है कि लोड की गई क्लास में संदर्भित मेथड सिग्नेचर गायब है।
अन्य कम सामान्य त्रुटियों में शामिल हैं:
- `java.lang.AbstractMethodError`;
- `java.lang.IllegalAccessError`;
- `java.lang.IncompatibleClassChangeError`;
- `java.lang.NoSuchFieldError`;
- `java.lang.NoSuchMethodError`.

आप `java.lang.LinkageError` से विरासत में मिली अपवादों के ट्री में उनकी पूरी सूची पा सकते हैं।

कभी-कभी कोई स्पष्ट त्रुटि नहीं होती है, लेकिन आप क्लास स्रोतों के बारे में अनिश्चित हो सकते हैं।
ऐसे मामले में आप जल्दी से स्रोत का पता लगा सकते हैं, उदाहरण के लिए:
- `Thread.currentThread().getContextClassLoader().loadClass("org.apache.commons.io.IOUtils").getProtectionDomain().getCodeSource().getLocation();`
- `Thread.currentThread().getContextClassLoader().getResource("META-INF/services/javax.ws.rs.ext.RuntimeDelegate").getPath());`

### संगतता और टकराव

अक्सर, WLS लाइब्रेरी `/oracle_common/modules` डायरेक्टरी से आएंगी, जहाँ आप JAR नाम के आधार पर संस्करण को सत्यापित कर सकते हैं।
यदि कोई संस्करण प्रत्यय नहीं है, तो आप आर्काइव खोल सकते हैं और META-INF मेनिफेस्ट या मेवेन मेटाडेटा की तलाश कर सकते हैं।

स्रोत/बाइनरी संगतता का पता लगाने के लिए, JAPICC `japi-compliance-checker` है – एक लोकप्रिय उपकरण जिसे आप अपने सिस्टम पैकेज मैनेजर के साथ इंस्टॉल कर सकते हैं
और संभावित लिंकिंग समस्याओं के बारे में अधिक जानकारी प्राप्त कर सकते हैं।

अन्यथा, CAT (Classloader Analysis Tool) नामक एक WLS-विशिष्ट उपकरण है।
एक वेब एप्लिकेशन के रूप में, यह फैट WLS इंस्टॉलेशन के साथ बंडल किया गया है और, डिफ़ॉल्ट रूप से, `/wls-cat` संदर्भ के तहत तैनात किया गया है।

<img src="/img/hq/wls-cat-conflicts.png" alt="WLS CAT – क्लास टकराव" title="WLS CAT – क्लास टकराव">

बाईं ओर ट्री में अपने एप्लिकेशन का चयन करें और फिर टकराव में मौजूद संभावित पैकेजों के साथ-साथ सुझाए गए समाधानों को सत्यापित करने के लिए 'Analyze Conflicts' टैब पर जाएं।
फ़िल्टरिंग को कॉन्फ़िगर करने के बाद, सूची छोटी हो जानी चाहिए। रिफ्रेश करें और फ़िल्टरिंग को सत्यापित करने के लिए 'Classloader Tree' पर जाएं।
सीधे EJB/WAR क्लास और निर्भरताओं में टकराव का ठीक से पता लगाया जाना चाहिए।

<img src="/img/hq/wls-cat-classloaders-hierarchy.png" alt="WLS CAT – फ़िल्टरिंगक्लासलोडर" title="WLS CAT – फ़िल्टरिंगक्लासलोडर">

भले ही स्टैंडअलोन EJB डिप्लॉयमेंट के लिए एक अलग फ़िल्टरिंग क्लास लोडर भी प्रतीत होता है, मुझे इसे
कॉन्फ़िगर करने का कोई साफ तरीका नहीं मिला। न तो `weblogic-application.xml` और न ही `weblogic.xml` डिस्क्रिप्टर यहां फिट बैठते हैं, और न ही '-ejb' वाले में ऐसी कोई कॉन्फ़िगरेशन प्रॉपर्टी है।
इस प्रकार, मैं इस मामले में बस EJB मॉड्यूल को एक EAR में लपेटने का सुझाव देता हूं।

### Java 9 समर्थन

अंत में, पुराने WLS संस्करणों पर, आपको निम्नलिखित त्रुटि का सामना करना पड़ सकता है:

> java.lang.UnsupportedClassVersionError: module-info has been compiled by a more recent version of the Java Runtime (class file version 53.0), this version of the Java Runtime only recognizes class file versions up to 52.0

कुछ लाइब्रेरियों ने Java 9 मॉड्यूल एनकैप्सुलेशन के लिए समर्थन जोड़ा है। भले ही लाइब्रेरी Java 8 पर चल सकती है, इसके साथ एक `module-info` होता है, जो आमतौर पर या तो लाइब्रेरी के रूट में या `META-INF/versions` डायरेक्टरी में होता है।
WLS के मामले में, यह रनटाइम पर त्रुटियों का कारण बन सकता है क्योंकि फ़ाइल Java 9 के लिए संकलित है:
- `beans.xml` द्वारा कॉन्फ़िगर करने योग्य डिफ़ॉल्ट CDI स्कैनिंग के कारण;
- CAT स्कैनिंग को रोकता है।

सबसे सीधा तरीका यह है कि इसे लाइब्रेरी से हटा दिया जाए, उदाहरण के लिए, एक प्रासंगिक चरण के दौरान `truezip-maven-plugin` प्लगइन का उपयोग करके।
निम्नलिखित कॉन्फ़िगरेशन पर एक नज़र डालें जो Java 8 WLS पर चल रहे WAR के भीतर बंडल किए गए *log4j* के लिए असंगत फ़ाइलों को हटाता है:

```
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>truezip-maven-plugin</artifactId>
        <version>1.2</version>
        <executions>
          <execution>
            <id>remove-log4j2-java9-meta</id>
            <goals>
              <goal>remove</goal>
            </goals>
            <phase>package</phase>
            <configuration>
              <filesets>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-api-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-core-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
              </filesets>
            </configuration>
          </execution>
        </executions>
      </plugin>
```

यदि CAT स्टैकट्रेस में असंगत module-info का स्थान नहीं दिखाता है, तो एक्सप्लोडेड डायरेक्टरी में सभी जार में इसके लिए बस grep करें।
भले ही जार बाइनरी फाइलें हैं, आपको आम तौर पर कुछ वैध मैच मिलने चाहिए, यदि नहीं, तो मानक `jar` जावा टूल का उपयोग करें: `jar tf <JAR> | grep module-info`।
