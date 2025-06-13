---
title: Java फॉरेन लिंकर API एक्शन में
url: java-फॉरेन-लिंकर-api-setsockopt
id: 72
category:
- java: जावा
tags:
  - नेटिव
author: Damian Terlecki
date: 2021-08-08T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

[मेरे पिछले लेखों में से एक में](/posts/java-socket-native-options), मैंने दिखाया कि हम JNA (जावा नेटिव एक्सेस) का उपयोग करके कुछ नेटिव TCP/IP विकल्प सेट करने के लिए जावा सॉकेट डिस्क्रिप्टर का उपयोग कैसे कर सकते हैं। हाल ही में, JDK वृद्धि प्रस्ताव [JEP 389: फॉरेन लिंकर API (इनक्यूबेटर)](https://openjdk.java.net/jeps/389) को JDK 16 में फॉरेन-मेमोरी एक्सेस API (JEP-370<wbr>/<wbr>JEP 383<wbr>/<wbr>JEP 393) के पूरक के रूप में लागू किया गया, जिसने एक और शक्तिशाली इंटरफ़ेस पेश किया जो C पुस्तकालयों के साथ शानदार अंतर-संचालन की अनुमति देता है।

JEP 389 वास्तव में `jdk.incubator.foreign` पैकेज के रूप में एक इनक्यूबेशन मॉड्यूल (JEP 11) है। इसका मतलब है कि इंटरफ़ेस अभी तक अंतिम रूप नहीं दिया गया है, लेकिन JDK 16 में हम पहले से ही इस सुविधा का परीक्षण कर सकते हैं। तो चलिए देखते हैं कि जब JNA को FLA (फॉरेन लिंकर API) से बदल दिया जाता है तो नेटिव सॉकेट विकल्पों का कार्यान्वयन कैसा दिख सकता है।

## फॉरेन लिंकर API और setsockopt

हमारे खेल के मैदान को स्थापित करने के लिए, हमें संकलन चरण में `jdk.incubator.foreign` मॉड्यूल जोड़ना होगा। मेवेन का उपयोग करते हुए, बस निम्नलिखित पैरामीटर *maven-compiler-plugin* में जोड़ें:

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
                <source>16</source>
                <target>16</target>
                <compilerArgs>
                    <arg>--add-modules</arg>
                    <arg>jdk.incubator.foreign</arg>
                </compilerArgs>
            </configuration>
        </plugin>
    </plugins>
</build>
```

यह हमें नए पैकेज से कक्षाओं की दृश्यता (IDE/कंपाइलर में) प्रदान करना चाहिए। हम **CLinker** क्लास से शुरू करेंगे। स्थैतिक तरीकों के अलावा, इस ऑब्जेक्ट के एक उदाहरण पर, हम दो तरीके पा सकते हैं: ***downcallHandle*** और ***upcallStub***। पहला आपको एक बाहरी फ़ंक्शन (जैसे C लाइब्रेरी से) को मैप करने की अनुमति देता है, जबकि दूसरे का उपयोग ऐसे फ़ंक्शन के लिए एक पॉइंटर बनाने के लिए किया जा सकता है, जिसे बाद में दूसरे फ़ंक्शन में पास किया जा सकता है।

***setsockopt*** C फ़ंक्शन को कॉल करने के लिए, हम ***downcallHandle*** विधि का उपयोग करेंगे। इसके लिए, हमें फ़ंक्शन प्रतीक को देखना होगा और उसके प्रकार और डिस्क्रिप्टर को परिभाषित करना होगा। ये तर्क काफी प्रासंगिक हैं, और निम्नलिखित कोड निश्चित रूप से आपके लिए समझने योग्य होगा:

```java
import jdk.incubator.foreign.CLinker;
import jdk.incubator.foreign.FunctionDescriptor;
import jdk.incubator.foreign.LibraryLookup;
import jdk.incubator.foreign.MemoryAddress;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodType;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    // /usr/include/x86_64-linux-gnu/sys/socket.h:
    // extern int setsockopt (int __fd, int __level, int __optname, const void *__optval, socklen_t __optlen) __THROW; 
    private static final MethodHandle setsockopt = CLinker.getInstance().downcallHandle(
            LibraryLookup.ofDefault()
                    .lookup("setsockopt")
                    .orElseThrow(ExceptionInInitializerError::new),
            MethodType.methodType(
                    int.class,
                    int.class,
                    int.class,
                    int.class,
                    MemoryAddress.class,
                    int.class
            ),
            FunctionDescriptor.of(
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_INT,
                    CLinker.C_POINTER,
                    CLinker.C_INT
            )
    );
    //...
}
```

लाइब्रेरी फ़ंक्शन को ***LibraryLookup*** उदाहरण के माध्यम से देखा जा सकता है। यदि फ़ंक्शन वर्चुअल मशीन से जुड़े स्थैतिक पुस्तकालयों का हिस्सा है, तो हम ***ofDefault*** स्थैतिक फ़ैक्टरी विधि का उपयोग कर सकते हैं। वैकल्पिक रूप से, लाइब्रेरी का नाम जानते हुए, हम इसे ***ofLibrary*** स्थैतिक विधि का उपयोग करके लोड कर सकते हैं।

अंत में, हम फ़ंक्शन पैरामीटर को परिभाषित करने के लिए ***MethodType*** का उपयोग करते हैं और उन्हें लिंक करने के लिए ***FunctionDescriptor*** का। ध्यान दें कि ***CLinker.C_POINTER*** कैसे कुछ मेमोरी पते पर ***MemoryAddress*** पॉइंटर को इंगित करता है।

साथ ही, इंटरफ़ेस आपको एक चयनित लाइब्रेरी से एक वैश्विक चर के लिए एक संदर्भ परिभाषित करने की अनुमति देता है (उदाहरण के लिए, सिस्टम फ़ंक्शन द्वारा सेट किए गए त्रुटि कोड के लिए):

```java
import jdk.incubator.foreign.MemorySegment;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    private static final MemorySegment errno = LibraryLookup.ofDefault()
            .lookup("errno").orElseThrow(ExceptionInInitializerError::new)
            .address().asSegmentRestricted(8);
    //...
}
```

फ़ंक्शन कॉल रिफ्लेक्शन तंत्र के समान है। हालाँकि, JNA के विपरीत, हमें कोई अपवाद नहीं मिलेगा जब कोई नेटिव फ़ंक्शन गैर-शून्य मान के साथ बाहर निकलता है। हमें स्पष्ट रूप से त्रुटि कोड/संदेश पुनर्प्राप्ति को नेटिव कोड की तरह ही लागू करना होगा:

```java
import dev.termian.setsockopt.net.impl.FileDescriptorWrapper;
import java.io.IOException;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    private static void setSockOpt(FileDescriptorWrapper fileDescriptor, int level, int optionName, MemorySegment optionValue) throws Throwable {
        Integer result = (Integer) setsockopt.invoke(
                fileDescriptor.getFd(),
                level,
                optionName,
                optionValue.address(),
                4
        );
        if (result != 0) {
            throw new IOException("Error code: " + errno.toIntArray()[0]);
        }
    }
    //...
}
```

अंतिम तर्क का टुकड़ा नेटिव मेमोरी आवंटन है। ध्यान दें कि यह **हीप के बाहर** होता है। आवंटित खंड का उपयोग तब सॉकेट विकल्प का मान सेट करने के लिए किया जा सकता है। अंततः, इंटरफ़ेस C कार्यों में उपयोग के लिए नेटिव मेमोरी पते को उजागर करता है।

```java
import jdk.incubator.foreign.MemoryAccess;

public class LinuxForeignSocketConfigurer extends SocketConfigurer {
    //...
    @Override
    public void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment) {
        try (MemorySegment optionValue = MemorySegment.allocateNative(32)) {
            MemoryAccess.setIntAtIndex(optionValue, 0, dontFragment ? CSocket.IP_PMTUDISC_WANT : CSocket.IP_PMTUDISC_DONT);
            setSockOpt(fileDescriptor, CSocket.IPPROTO_IP, CSocket.IP_MTU_DISCOVER, optionValue);
        } catch (Throwable throwable) {
            throw new RuntimeException(throwable);
        }
    }
}
```

जावा 16 पर निष्पादित होने पर, एक अतिरिक्त चरण की आवश्यकता होती है। `foreign.restricted` ध्वज इस API के कुछ हिस्सों के अप्रत्याशित उपयोग को रोकता है। यदि सावधानी से नहीं संभाला गया तो ये क्रैश या मेमोरी भ्रष्टाचार का परिणाम हो सकते हैं। इसे ध्यान में रखते हुए, साथ ही पिछले लेख में डिस्क्रिप्टर प्राप्त करने के लिए उपयोग किए गए रिफ्लेक्शन तंत्र को ध्यान में रखते हुए, हमारे प्रोग्राम को चलाने की अनुमति देने वाले JVM पैरामीटर इस तरह दिखेंगे:
```shell
--illegal-access=permit --add-modules jdk.incubator.foreign -Dforeign.restricted=warn
```

<img src="/img/hq/java-foreign-linker-api.png" alt="संकलन चरण के दौरान मॉड्यूल गायब: &quot;java: package jdk.incubator.foreign is not visible&quot;, रनटाइम के दौरान: &quot;java.lang.NoClassDefFoundError: jdk/incubator/foreign/MemoryLayout&quot;, ध्वज गायब: &quot;java.lang.IllegalAccessError: Illegal access to restricted foreign method: CLinker.getInstance ; system property 'foreign.restricted' is set to 'deny'&quot;" title="फॉरेन लिंकर API: -Dforeign.restricted=warn">

## सारांश

फॉरेन लिंकर API और फॉरेन मेमोरी एक्सेस API बहुत ही आशाजनक JDK सुधार हैं। वे C पुस्तकालयों और नेटिव मेमोरी के साथ अविश्वसनीय अंतर-संचालन प्रदान करते हैं। इनक्यूबेशन चरण में, वे कई संभावनाएं प्रदान करते हैं जो अब तक केवल JNA / JNI गोंद कोड और `sun.misc.Unsafe` क्लास का उपयोग करके उपलब्ध थीं। यदि आप इस नमूने के पूर्ण स्रोत कोड पर एक नज़र डालना चाहते हैं, तो पृष्ठ के निचले भाग में रिपॉजिटरी पर एक नज़र डालें।
