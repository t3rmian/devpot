---
title: WebLogic क्लाइंट डेटा सोर्स लुकअप
url: weblogic-क्लाइंट-डेटा-सोर्स-लुकअप
id: 65
category:
- jee: जेईई
tags:
  - वेबलॉजिक
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

WebLogic सर्वर के लिए EJB तकनीक में एक एप्लिकेशन बनाते समय, डेटाबेस तक पहुंच आमतौर पर EJB बीन्स के माध्यम से की जाती है। हालांकि, कभी-कभी, SE क्लाइंट के दृष्टिकोण से, हमें डेटाबेस तक कुछ सीधी पहुंच की आवश्यकता हो सकती है, जैसे कि हमारे सिस्टम या एकीकरण परीक्षणों को सत्यापित करने के लिए।

डेटाबेस से कनेक्शन प्रदान करने वाला मूल तत्व WebLogic पर कॉन्फ़िगर किया गया डेटा सोर्स है। हम हमेशा InitialContext या `@Resource` एनोटेशन के माध्यम से डेटा सोर्स का संदर्भ पा सकते हैं, यह मानते हुए कि हम एक कंटेनर-प्रबंधित सीड में हैं।

## WebLogic 12.x क्लाइंट डेटासोर्स

हालांकि, क्लाइंट स्तर से WebLogic 12.x सर्वर द्वारा प्रबंधित डेटासोर्स का संदर्भ प्राप्त करने के लिए, कुछ अतिरिक्त पूर्वापेक्षाएँ हैं। हमें *wlfullclient.jar* लाइब्रेरी की आवश्यकता होगी। डिफ़ॉल्ट रूप से, यह लाइब्रेरी मेवेन रिपॉजिटरी में नहीं मिलती है, और हमें इसे अपने दम पर, WebLogic इंस्टॉलेशन डायरेक्टरी से बनाना होगा। लाइब्रेरी कैसे बनाई जाए यह [प्रलेखन](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D) में वर्णित है:
1. `WL_HOME/server/lib` डायरेक्टरी खोजें।
2. लाइब्रेरी बनाएँ: `java -jar wljarbuilder.jar`।
3. क्लासपाथ में लाइब्रेरी जोड़ें। `-cp` पैरामीटर के साथ खेलने के अलावा, हम इसे एक स्थानीय रिपॉजिटरी में स्थापित कर सकते हैं और इसे मेवेन निर्भरताओं में जोड़ सकते हैं:
```bash
mvn install:install-file -Dfile=wlfullclient.jar -DgroupId=com.oracle -DartifactId=wlfullclient -Dversion=12.2.1.4 -Dpackaging=jar
```
```xml
<dependency>
    <groupId>com.oracle</groupId>
    <artifactId>wlfullclient</artifactId>
    <version>12.2.1.4</version>
    <scope>test</scope>
</dependency>
```

यदि आपको डेटासोर्स जैसे स्टब्स की आवश्यकता नहीं है और आप बुनियादी EJB संचार से संतुष्ट हैं, तो आप उसी डायरेक्टरी से *wlthint3client.jar* लाइब्रेरी का उपयोग कर सकते हैं। संदर्भ प्राप्त करना काफी मानक लगता है और InitialContext के माध्यम से किया जाता है। एक संदर्भ कारखाने के रूप में, हम एक WebLogic-विशिष्ट कारखाना निर्दिष्ट करते हैं। यह वर्ग संलग्न पुस्तकालयों से आता है।

```java
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Properties;

import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.Assert.assertTrue;

public class DatabaseIT {
    private final InitialContext context;
    private final DataSource dataSource;
    private final MyEjbService service;

    public DatabaseIT() throws NamingException {
        Properties env = new Properties();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory");
        env.put(Context.PROVIDER_URL, "t3://localhost:7001");
        context = new InitialContext(env);
        dataSource = (DataSource) context.lookup("my.datasource.jndi");
        service = (MyEjbService) context.lookup("my.ejb.service.jndi");
    }

    @Test
    public void testConnection() throws SQLException {
        service.foo();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM DUAL");
             ResultSet resultSet = statement.executeQuery()) {
            assertTrue(resultSet.next());
            assertThat(resultSet.getString(1), equalTo("X"));
        }
    }
}
```

हमारा एकीकरण परीक्षण, या यूँ कहें कि एक सिस्टम परीक्षण, सफलतापूर्वक समाप्त होना चाहिए। आप WebLogic कंसोल में उचित JNDI नाम पा सकते हैं, *सेवाएँ -> डेटा स्रोत* ट्री में कनेक्शन कॉन्फ़िगरेशन खोजकर:

<img src="/img/hq/wlfullclient-test.png" alt="डेटासोर्स JNDI" title="डेटासोर्स JNDI">

*wlfullclient.jar* लाइब्रेरी के बिना, हमें डेटासोर्स का संदर्भ प्राप्त करने का प्रयास करते समय निम्नलिखित त्रुटि से आश्चर्यचकित नहीं होना चाहिए:
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

इसके अलावा, किसी भी क्लाइंट लाइब्रेरी के बिना, हम *weblogic.jndi.WLInitialContextFactory* की कमी के कारण संदर्भ को प्रारंभ नहीं कर पाएंगे:
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## WebLogic 14.x क्लाइंट डेटासोर्स

*wlfullclient.jar* लाइब्रेरी संस्करण 12.2.1.3 में पहले से ही **पदावनत** थी। अब संस्करण 14.1.1.0 में हमें *wljarbuilder.jar* नहीं मिलेगा, इसलिए हम अब *wlfullclient.jar* नहीं बना पाएंगे। हम पिछले संस्करणों में से किसी एक से निर्मित *wlfullclient.jar* पैकेज का उपयोग कर सकते हैं और संस्करण 14.1.1.0 के साथ अलेखित संगतता की उम्मीद कर सकते हैं।

उदाहरण के लिए, संस्करण 12.2.1.3 या 12.2.1.4 से पैकेज का उपयोग करके, हमारा परीक्षण बिना किसी समस्या के पास हो जाएगा, लेकिन 12.1.3 के साथ हमें संदर्भ के प्रारंभ के दौरान एक त्रुटि मिलेगी:
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

एक अधिक संगत समाधान *WL_HOME/modules* डायरेक्टरी में आवश्यक कक्षाएं वाली लाइब्रेरी खोजना है। यह उस डायरेक्टरी में से है, जिसमें से *wljarbuilder.jar* पिछले संस्करणों में *wlfullclient.jar* बनाता है। हम अपनी आवश्यक कक्षाएं खोजने के लिए निम्नलिखित कमांड का उपयोग कर सकते हैं:

```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- डेटासोर्स क्लास *WL_HOME/modules/com.bea.core.datasource6.jar* में मिलेगी।

नए स्टैक ट्रेस के ब्रेडक्रंब का पालन करते हुए, हमें लापता कक्षाएं मिलेंगी:
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

ये 3 पैकेज और *wlthint3client.jar* आपको क्लाइंट (जावा SE) से WebLogic 14.1.1.0 द्वारा प्रबंधित डेटासोर्स का संदर्भ प्राप्त करने और सफलतापूर्वक डेटाबेस से क्वेरी करने की अनुमति देंगे। यदि आपके कंटेनर को एक प्रमाणित कनेक्शन की आवश्यकता है, तो `Context.SECURITY_PRINCIPAL` और `Context.SECURITY_CREDENTIALS` InitialContext गुणों के माध्यम से क्रेडेंशियल सेट अप करना न भूलें।

