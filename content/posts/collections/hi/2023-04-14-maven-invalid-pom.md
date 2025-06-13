---
title: एक अनसुलझी Maven प्रॉपर्टी के कारण अमान्य POM
url: मैवेन-अमान्य-पोम
id: 108
category:
- java: जावा
tags:
- मैवेन
- जैक्स-डब्लूएस
- जकार्ता
author: Damian Terlecki
date: 2023-04-14T20:00:00
---

Maven प्रोजेक्ट बिल्ड को प्रबंधित करने के लिए `pom.xml` कॉन्फ़िगरेशन फ़ाइल का उपयोग करता है। फ़ाइल को पार्स करते समय,
उपकरण प्रोजेक्ट निर्भरताओं को हल करता है और यह निर्धारित करता है कि आर्टिफैक्ट बनाने के लिए किन पुस्तकालयों और उपकरणों की आवश्यकता है।
इस प्रक्रिया में, Maven सकर्मक निर्भरताओं को निर्धारित करने के लिए बाहरी POM फ़ाइलों को भी पार्स करता है।

## अनसुलझी Maven प्रॉपर्टी

ऐसा हो सकता है कि किसी दूरस्थ लाइब्रेरी POM फ़ाइल में त्रुटियां हों, जो वाक्य-विन्यास संबंधी त्रुटियों से अधिक तार्किक हों।
इस प्रकार की समस्याओं का एक कारण उन अभिव्यक्तियों का उपयोग है जो गैर-मौजूद [maven गुणों](https://maven.apache.org/pom.html#Properties) को संदर्भित करती हैं।
निर्भरता प्रसंस्करण के दौरान त्रुटियों के मामले में, Maven सकर्मक आर्टिफैक्ट को लोड करना छोड़ देगा, और हम एक उदाहरण चेतावनी आउटपुट करेंगे:

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details' alt='[WARNING] com.sun.xml.ws:jaxws-rt:jar:2.2.10 के लिए POM अमान्य है, सकर्मक निर्भरताएँ (यदि कोई हो) उपलब्ध नहीं होंगी, अधिक विवरण के लिए डीबग लॉगिंग सक्षम करें'>

आप जल्दी से देखेंगे कि `pom.xml` लाइब्रेरी में घोषित निर्भरताएँ मूल रूप से अनदेखा कर दी जाती हैं और प्रोजेक्ट में हल नहीं हो पाती हैं।
कारण के बारे में अधिक जानने के लिए, `-X` पैरामीटर जोड़ें। यह `--debug` पैरामीटर का एक छोटा संक्षिप्त रूप है।

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' for com.sun:tools:jar must specify an absolute path but is ${tools.jar} @

इस विशेष मामले में, Maven `${tools.jar}` अभिव्यक्ति का मूल्यांकन करने में असमर्थ है।
`pom.xml` फ़ाइलों को देखने पर, हम यह निष्कर्ष निकालते हैं कि यह अभिव्यक्ति पैरेंट POM में से किसी एक में सिस्टम `tools` निर्भरता को परिभाषित करने के लिए आवश्यक है:

```xml
<!--...-->
<profiles>
    <!--...-->
    <profile>
        <id>default-tools.jar</id>
        <activation>
            <file>
                <exists>${java.home}/../lib/tools.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../lib/tools.jar</tools.jar>
        </properties>
    </profile>
    <profile>
        <id>default-tools.jar-mac</id>
        <activation>
            <file>
                <exists>${java.home}/../Classes/classes.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../Classes/classes.jar</tools.jar>
        </properties>
    </profile>
</profiles>
<!--...-->
<dependencyManagement>
    <dependencies>
        <!-- JDK dependencies -->
        <dependency>
            <groupId>com.sun</groupId>
            <artifactId>tools</artifactId>
            <version>1.6</version>
            <scope>system</scope>
            <systemPath>${tools.jar}</systemPath>
        </dependency>
    </dependencies>
    <!--...-->
</dependencyManagement>
<!--...-->
```

इस विशेष आर्टिफैक्ट की निर्भरताओं के और सत्यापन के बाद, आप इस निष्कर्ष पर भी आ सकते हैं कि इस सबमॉड्यूल में सिस्टम निर्भरता का उपयोग नहीं किया गया है।
दुर्भाग्य से, `${java.home}/../lib/tools.jar` या `${java.home}/../Classes/classes.jar` स्थान में फ़ाइल की कमी `${tools.jar}` चर को अघोषित बना देती है।

इस उदाहरण के लिए विशिष्ट, समस्या JDK 11+ संस्करण से संबंधित है। इस संस्करण में, उल्लिखित उपकरणों को हटा दिया गया है।
यह परिवर्तन `jaxws-rt:2.3.x` से शुरू होकर समर्थित है, जिसमें इस लाइब्रेरी के लिए प्रासंगिक एक विनिर्देश उन्नयन भी शामिल है।

कुल मिलाकर, समस्या अधिक सामान्य है और इसे एक ऐसी स्थिति में एक्सट्रपलेशन किया जा सकता है जहां बाहरी निर्भरताओं को हल करते समय Maven एक अभिव्यक्ति का मूल्यांकन करने में असमर्थ है।
क्या इस पर हमारा कोई प्रभाव है?

## POM फ़ाइल अभिव्यक्ति मूल्यांकन

गुण स्रोत मूल्यांकन क्रम Maven v3/4 के लिए [`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175) में लागू किया गया है और इसे इस प्रकार सरल बनाया जा सकता है:
- जावा गुण - `-Dkey=value`;
- Maven गुण - `<properties><key>value</key></properties>`;
- पर्यावरण चर - `set/export key=value`।

एक बहु-मॉड्यूल प्रोजेक्ट में, Maven गुण उसी प्रोजेक्ट के भीतर सबमॉड्यूल द्वारा विरासत में प्राप्त किए जा सकते हैं। हालाँकि, ये चर स्वचालित रूप से प्रोजेक्ट की बाहरी निर्भरताओं में प्रचारित नहीं होते हैं।
दूसरी ओर, जावा और पर्यावरण चर Maven प्रसंस्करण की शुरुआत में प्रारंभ किए जाते हैं, इसलिए निष्पादन के दौरान उन्हें जोड़ने से मूल्यांकन पर कोई प्रभाव नहीं पड़ता है।
इसके अलावा, बाहरी निर्भरताओं के मामले में, जावा चर को पर्यावरण चर के स्तर तक समेकित किया जाता है ([MNG-7563](https://issues.apache.org/jira/browse/MNG-7563))।

उपरोक्त नियमों को जानने के बाद, आप बाहरी `pom.xml` में एक Maven प्रॉपर्टी को कई अलग-अलग तरीकों से प्रारंभ कर सकते हैं, उदाहरण के लिए, इसके माध्यम से:
- पर्यावरण चर (यूनिक्स-जैसे सिस्टम पर डॉट-युक्त चर निर्यात करने में समस्याओं से सावधान रहें);
- कमांड लाइन `mvn -Dkey=value validate` का उपयोग करके प्रारंभ किया गया जावा प्रॉपर्टी;
- कमांड की शुरुआत में पर्यावरण चर `key=value mvn validate`;
- प्रोजेक्ट के सापेक्ष Maven कॉन्फ़िगरेशन फ़ाइल `.mvn/maven.config` जो जावा प्रॉपर्टी `-Dkey=value` सेट करती है;
- वैश्विक रन कमांड जो उदाहरण के लिए `~/.mavenrc` में परिभाषित हैं और जो पर्यावरण चर `set/export key=value` सेट करते हैं (IntelliJ में समस्याओं से सावधान रहें, जैसे [IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner))।

अंतिम उपाय निश्चित रूप से मैन्युअल रूप से (या अप्रत्यक्ष रूप से) निर्भरता को डाउनलोड करना और इसे आर्टिफैक्ट के संकलन/निर्माण पथों में जोड़ना है।

> एक वैकल्पिक बिल्ड टूल के रूप में, Gradle v4-8 यहाँ थोड़ा बेहतर प्रदर्शन करता है। यह गैर-प्रभावित निर्भरताओं के लिए कोई त्रुटि नहीं फेंकता है, और आर्टिफैक्ट सही ढंग से आयात हो जाते हैं।
