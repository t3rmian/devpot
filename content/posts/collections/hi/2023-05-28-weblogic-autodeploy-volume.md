---
title: Docker Compose के साथ WebLogic ऑटो-डिप्लॉय
url: वेब्लॉजिक-ऑटो-डिप्लॉय-डॉकर-कंपोज
id: 111
category:
- jee: जेईई
tags:
- वेब्लॉजिक
- क्लासलोडिंग
- डॉकर
author: Damian Terlecki
date: 2023-05-29T20:00:00
---

Docker Compose एक आसान उपकरण है जो आपको कई कंटेनरों से युक्त विकास वातावरण को जल्दी से चालू करने की अनुमति देता है।
डॉकर छवियों के संदर्भ में, विशिष्ट रणनीति एक नए एप्लिकेशन के संस्करण के साथ एक नई छवि बनाना और इसे एक बाहरी वातावरण में तैनात करना है।
विकास के माहौल की जरूरतों के लिए, आप एप्लिकेशन के एक नए पुनरावृत्ति को तैनात करने के लिए उसी कंटेनर का पुन: उपयोग करके इसे तेज कर सकते हैं।

<img src="/img/hq/wls-autodeploy-project-tree.png" title='WebLogic स्टार्टअप लॉग जो गैर-उत्पादन मोड के आधार पर ऑटो-डिप्लॉय उपलब्धता निर्धारित करते हैं' alt='WebLogic स्टार्टअप लॉग जो गैर-उत्पादन मोड के आधार पर ऑटो-डिप्लॉय उपलब्धता निर्धारित करते हैं - domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

WebLogic के मामले में, सर्वर एक स्वचालित परिनियोजन सुविधा प्रदान करता है। आपको बस इतना करना है कि आर्टिफैक्ट
या एक एक्सप्लोडेड आर्काइव को `autodeploy` डायरेक्टरी में रखें। Docker वॉल्यूम की मदद से, आप एप्लिकेशन आर्टिफैक्ट को स्वचालित परिनियोजन के स्थान पर बाइंड कर सकते हैं।

निर्माण करते समय, कलाकृतियाँ आमतौर पर `build` (Gradle) या `target` (Maven) डायरेक्टरी में उत्पन्न होती हैं। हालाँकि, इस पथ को सीधे लिंक करना
कई कारणों से सबसे अच्छा विचार नहीं है:
1. इसमें गैर-तैनात करने योग्य उपनिर्देशिकाएँ होती हैं।
2. एक लापता आर्टिफैक्ट एक खाली उपनिर्देशिका में बदल जाएगा।
3. प्रत्येक `mvn clean` के साथ, वॉल्यूम बाइंड अगले पुनरारंभ तक खोया हुआ प्रतीत हो सकता है [(filesystem-specific)](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094)।

इसलिए, एक विश्वसनीय कॉन्फ़िगरेशन जिसके लिए मैन्युअल हस्तक्षेप की आवश्यकता नहीं है, वॉल्यूम को पैरेंट डायरेक्टरी से बाइंड करना है।

```bash
project/
├─ src/
│  ├─ main/
│  │  ├─ java/
│  │  │  ├─ .../
│  │  ├─ webapp/
│  │  │  ├─ WEB-INF/
│  │  │  │  ├─ web.xml
├─ target/
│  ├─ classes
│  ├─ wlsdemo
│  ├─ wlsdemo.war
├─ src/
│  ├─ index.css
│  ├─ index.js
├─ docker-compose.yml
├─ domain.properties
├─ pom.xml
```

उपरोक्त नमूना ट्री में, `project` फ़ोल्डर को कंटेनर के अंदर `/project` डायरेक्टरी से बाइंड करने के लिए, निम्नलिखित `docker-compose.yml` का उपयोग करें:

```yaml
version: '3'
services:
  weblogic:
    build: ./
    environment:
      - "debugFlag=true"
      - "DEBUG_PORT=*:8453"
    ports:
      - "7001:7001" #admin_listen_port
      - "9002:9002" #secure administration_port
      - "8453:8453" #custom debug port
    volumes:
      - ./:/project
      - ./:/u01/oracle/properties
```

आप एक सॉफ्ट लिंक का उपयोग करके स्वचालित आर्टिफैक्ट परिनियोजन को लागू कर सकते हैं। नीचे दिए गए `Dockerfile` पर एक नज़र डालें।
यह `docker-compose.yml` द्वारा ऑटो-बिल्ड है। `package` चरण के दौरान `maven-war-plugin`/`maven-ear-plugin`
द्वारा उत्पन्न एक्सप्लोडेड आर्काइव को एक पूर्ण आर्टिफैक्ट के साथ भी बदला जा सकता है।

```Dockerfile
# Requires license acceptation at https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

`classes` सबफ़ोल्डर का संशोधन निरंतर आधार पर मॉनिटर किया जाता है और क्लास लोडर को फिर से लोड करने का कारण बनता है।
[दस्तावेज़ीकरण](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)
`REDEPLOY` फ़ाइल (एक्सप्लोडेड WAR/EAR आर्टिफैक्ट के WEB-INF/META-INF के तहत) को अपडेट करके एक पूर्ण पुन: परिनियोजन का भी वर्णन करता है। `package` के दौरान अंतिम के रूप में रखे गए `maven-antrun-plugin` के साथ इसे स्वचालित करें।

```xml
    <build>
        <finalName>${artifactId}</finalName>
        <plugins>
            <!--...-->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-antrun-plugin</artifactId>
                <version>3.0.0</version>
                <executions>
                    <execution>
                        <id>touch-redeploy-file</id>
                        <phase>package</phase>
                        <goals>
                            <goal>run</goal>
                        </goals>
                        <configuration>
                            <target>
                                <touch file="${project.build.directory}/${project.artifactId}/WEB-INF/REDEPLOY"
                                       verbose="true" />
                            </target>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
</build>
```

उदाहरण में, मैंने `debugFlag` और `DEBUG_PORT` पर्यावरण चर का उपयोग किया है। ये
`/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh` स्क्रिप्ट द्वारा नियंत्रित किए जाते हैं। संक्षेप में, यह सभी नेटवर्क इंटरफेस (JDK 9+) पर डीबगर मोड को कॉन्फ़िगर करता है।
अब आप डीबग कर सकते हैं
और अपने पसंदीदा IDE (IntelliJ > Edit Configuration > Remote JVM Debug) द्वारा सुगम JPDA हॉट स्वैप का लाभ उठा सकते हैं।

> `domain.properties` फ़ाइल कस्टम इनिशियलाइज़ेशन स्क्रिप्ट के बिना एक क्लीन इमेज के लिए आवश्यक है। इसमें निम्नलिखित प्रारूप में व्यवस्थापक उपयोगकर्ता नाम और पासवर्ड होना चाहिए:
> ```properties
username=myadminusername
password=myadminpassword12#

> यदि आप JVM डीबगर के संलग्न होने की प्रतीक्षा करना चाहते हैं, तो `debugFlag` के बजाय सीधे `JAVA_OPTIONS` पर्यावरण चर को कॉन्फ़िगर करें।

> कस्टम पोर्ट मैपिंग से सावधान रहें। `t3` कनेक्शन स्थापित करने के लिए इसके लिए [`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171) की आवश्यकता हो सकती है।

