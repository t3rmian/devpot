---
title: REGEX का उपयोग करके WebLogic पसंदीदा पैकेज
url: वेब्लॉजिक-पसंदीदा-लाइब्रेरी-रेगेक्स
id: 110
category:
- jee: जेईई
tags:
- वेब्लॉजिक
- क्लासलोडिंग
- डॉकर
author: Damian Terlecki
date: 2023-05-14T20:00:00
---

<img src="/img/hq/wls-prefer-application-packages.png" title='WebLogic सर्वर डिस्क्रिप्टर की सामग्री का एक अंश जो पैकेट को अलग करता है: EL=एप्लिकेशन, MOXy=WLS (मेट्रो-जैक्स-ws के साथ संगत)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

जावा EE सर्वर - WebLogic - कंटेनर द्वारा मानक के रूप में प्रदान की गई पुस्तकालयों को अधिलेखित करने की एक सुविधा प्रदान करता है।
[ऐसी कॉन्फ़िगरेशन](/posts/weblogic-library-conflicts) `weblogic.xml` डिस्क्रिप्टर के माध्यम से संभव है जिसे WAR आर्टिफैक्ट के `WEB-INF` फ़ोल्डर में रखा गया है या `weblogic-application.xml` डिस्क्रिप्टर
को EAR संग्रह की `META-INF` डायरेक्टरी में डाला गया है।

आपको क्रमशः कक्षाओं और संसाधनों को लोड करने के लिए `prefer-application-packages` और `prefer-application-resources` तत्वों के उदाहरण उपयोग आसानी से मिल जाएंगे।
उदाहरण फ़िल्टर कभी-कभी (और कभी-कभी नहीं) `.*` प्रत्यय के साथ समाप्त होते हैं, जो REGEX या GLOB जैसा दिखता है।
हालांकि, दस्तावेज़ीकरण इस प्रारूप के विवरण की व्याख्या नहीं करता है, जो कि जब आप जटिल फ़िल्टरिंग लागू करना चाहते हैं तो काफी महत्वपूर्ण होते हैं।

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

क्या उपरोक्त कॉन्फ़िगरेशन `com.sample`, `com.sample.example`, `com.sample.example.subexample`, या इन संयोजनों में से किसी एक पैकेज की कक्षाओं को प्राथमिकता देता है?
`com.sample.example` को छोड़कर `com.sample.*` से सभी पैकेजों के लिए मिलान कैसे कॉन्फ़िगर करें?
क्या आप कक्षाओं को पूरे नाम तक फ़िल्टर कर सकते हैं, या यह सुविधा केवल पैकेजों पर लागू होती है (तत्व के नाम से अनुमानित)?

## WebLogic FilteringClassLoader

सभी प्रश्न कोड की ओर ले जाते हैं। `FilteringClassLoader` वह वर्ग है जिसे WebLogic द्वारा प्रदान की गई निर्भरताओं के बीच देखना है।
यह नाम एक और आसान उपकरण - क्लासलोडर विश्लेषण उपकरण की रिपोर्टिंग से आता है।
जैसे ही आप T3 प्रोटोकॉल क्लाइंट लाइब्रेरी `${WL_HOME}/server/lib/wlthint3client.jar` लोड करेंगे, आपको यह वर्ग मिल जाएगा।
अधिक सटीक रूप से, यह `weblogic.utils.classloaders` पैकेज में रहता है।

लाइसेंसिंग कारणों से, लाइब्रेरी को Maven सेंट्रल रिपॉजिटरी से हल नहीं किया जा सकता है।
सत्यापन उद्देश्यों के लिए, आप इसे WLS इंस्टॉलेशन के विकल्प के रूप में आधिकारिक डॉकर छवि के एक कंटेनर से निकाल सकते हैं:
```bash
#!/bin/bash
# Login, review and accept license at https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

अब, `weblogic.utils.classloaders.FilteringClassLoader` का बाइटकोड निम्नलिखित एल्गोरिथ्म में अनुवादित होता प्रतीत होता है:
1. पैटर्न लोड करें और अनुगामी `*` वर्ण को हटा दें;
2. यदि पैटर्न `.` में समाप्त होता है तो `{0,1}` प्रत्यय जोड़ें;
3. पैटर्न को `^` के साथ उपसर्ग करें;
4. `java.util.regex.Pattern` बनाएं और `find()` विधि का उपयोग करके वर्ग/संसाधन के पूरे नाम के लिए `matcher(String)` को कॉल करें।
5. यदि कोई मेल नहीं मिलता है, तो `loadClass/getResourceInternal/getResource/getResources` की लोडिंग को पैरेंट क्लासलोडर को सौंपें, अन्यथा एप्लिकेशन द्वारा प्रदान की गई क्लास/संसाधन लौटाएं।

इससे पता चलता है कि `prefer-application-packages` और `prefer-application-resources` तत्व REGEX का उपयोग करके पैकेज और संसाधनों के साथ-साथ व्यक्तिगत कक्षाओं की ठीक फ़िल्टरिंग की अनुमति देते हैं।
ध्यान दें कि कुछ जोड़ हैं, उदाहरण के लिए, शुरुआत और अंत के वर्णों `*` और `.` के संबंध में।

एंड-लाइन वर्ण पैटर्न में नहीं जोड़ा जाता है। `find()` विधि के उपयोग के साथ संयुक्त, यह आंशिक ( `matches()` के विकल्प के रूप में) मिलान के कारण फ़िल्टर किए गए पैकेटों की संख्या को बढ़ाता है।
इसके अलावा, पैकेज विभाजक यहां एक मनमाने वर्ण मिलान के रूप में काम करता है, जो पहली नज़र में अस्पष्ट हो सकता है और बहुत कम ही एक फ़िल्टरिंग की ओर ले जा सकता है जो इरादे से व्यापक है।

अंत में, तंत्र आपको एक नियमित अभिव्यक्ति को परिभाषित करने की अनुमति देता है जो सबपैकेज को छोड़ देगा। ऐसी अभिव्यक्ति (जैसे, `^com.sample(?!\.example$)`) WLS-प्रदत्त पुस्तकालयों के सेट पर वापस आने का कारण बनेगी यदि कोई अन्य मिलान नहीं मिलता है।
हालांकि, सरल अभिव्यक्तियों का उपयोग करने का प्रयास करें। अत्यधिक बैकट्रैकिंग से एप्लिकेशन आरंभीकरण समय में वृद्धि हो सकती है।

