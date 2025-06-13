---
title: जावा सॉकेट नेटिव विकल्प
url: जावा-सॉकेट-नेटिव-विकल्प
id: 70
category:
- java: जावा
tags:
  - नेटिव
author: Damian Terlecki
date: 2021-07-12T20:00:00
source: https://github.com/t3rmian/setsockopt-java-demo
---

जब जावा द्वारा प्रदान किए गए विकल्पों से परे TCP/IP विकल्पों को लागू करने की आवश्यकता होती है, तो हमारे पास चुनने के लिए कई विकल्प होते हैं:

1. [RockSaw](https://www.savarese.com/software/rocksaw/) लाइब्रेरी – आपको SOCK_RAW प्रकार का सॉकेट बनाने की अनुमति देती है, जो TCP/IP प्रसंस्करण को छोड़ देती है। यह समाधान आपके अपने प्रोटोकॉल के काफी निम्न-स्तरीय कार्यान्वयन की अनुमति देता है। ऐसा सॉकेट बनाने के लिए प्रशासक विशेषाधिकारों की आवश्यकता होती है।
2. एक कस्टम इंटरफ़ेस कार्यान्वयन जो आपको अतिरिक्त TCP/IP विकल्प सेट करने की अनुमति देता है - विभिन्न ऑपरेटिंग सिस्टम जावा द्वारा प्रदान किए गए विकल्पों से परे कुछ अतिरिक्त कॉन्फ़िगरेशन विकल्प प्रदान करते हैं। इस तरह के समाधान में एक बाहरी लाइब्रेरी का उपयोग शामिल है, जो *java.net/java.nio* पैकेज का विकल्प है, या JNI (जावा नेटिव इंटरफ़ेस) या JNA (जावा नेटिव एक्सेस) का उपयोग करके अपना स्वयं का कार्यान्वयन करना।
3. मानक जावा पैकेजों का पुन: उपयोग करना और उन्हें अतिरिक्त कॉन्फ़िगरेशन के लिए JNI/JNA बाइंडिंग के साथ जोड़ना।

इन तीन विकल्पों में जटिलता के विभिन्न स्तर हैं। सही समाधान चुनना और अन्य बातों के अलावा, रखरखाव की व्यवहार्यता, पोर्टेबिलिटी (क्रॉस-प्लेटफ़ॉर्म समर्थन), और त्रुटि-प्रवणता को ध्यान में रखना महत्वपूर्ण है।

दुर्भाग्य से, *RockSaw* के अलावा, मुझे मानक सॉकेट का उपयोग करके संचार के लिए कोई सिद्ध लाइब्रेरी नहीं मिली। इसके अतिरिक्त, अकेले रिफ्लेक्शन तंत्र का उपयोग करके, हम JNI विधियों में पाए जाने वाले कॉन्फ़िगरेशन बाधाओं को बायपास करने में असमर्थ हैं। तो चलिए जावा क्षमताओं से परे TCP/IP विकल्पों का विस्तार करने के लिए विकल्प 3 को सबसे कम समय लेने वाला मानते हैं।

<img src="/img/hq/java-ip-dont-fragment.png" alt="वायरशार्क – DF फ्लैग 0 पर सेट है" title="वायरशार्क – DF फ्लैग 0 पर सेट है">

## setsockopt

विंडोज, लिनक्स और बीएसडी पर TCP/IP विकल्पों को C भाषा *setockopt* फ़ंक्शन का उपयोग करके कॉन्फ़िगर किया जाता है। यह फ़ंक्शन उम्मीद करता है कि हम एक सॉकेट पास करें और साथ ही चयनित TCP/IP परत के प्रोटोकॉल और उसके मान को इंगित करने वाला विकल्प स्तर भी। सॉकेट एक फ़ाइल डिस्क्रिप्टर के बराबर है, जो सिस्टम पर संसाधन के एक अद्वितीय पहचानकर्ता को परिभाषित करता है।

`java.net.Socket` और `java.nio.channels.SocketChannel` से संबंधित मानक जावा कक्षाओं के **कार्यान्वयन** का विश्लेषण करके, हम निम्नलिखित कक्षाओं में ऐसे डिस्क्रिप्टर के संदर्भ पा सकते हैं:
- `java.net.Socket.impl` ➜ `java.net.SocketImpl.fd` ➜ `java.io.FileDescriptor.fd`;
- `sun.nio.ch.SocketChannelImpl.fd` ➜ `java.io.FileDescriptor.fd`.

कोड में और गहराई से देखने पर, हम देखेंगे कि डिस्क्रिप्टर *SocketChannel.open()* के माध्यम से चैनल को खोलने/बनाने के दौरान सेट किया जाता है। *Socket* निर्माण के मामले में, यह *bind/connect()* ऑपरेशन के दौरान किया जाता है। अंत में, (TCP/IP) विकल्प जावा संस्करण के लिए विशिष्ट [नेटिव विधि](https://github.com/openjdk/jdk/blob/739769c8fc4b496f08a92225a12d07414537b6c0/src/java.base/unix/native/libnio/ch/Net.c#L528) के माध्यम से सेट किए जाते हैं। अंततः, कॉल को *setsockopt* फ़ंक्शन में प्रत्यायोजित किया जाता है, जो संबंधित डिस्क्रिप्टर को कॉन्फ़िगर करता है।

## जावा ➜ *setsockopt*

यह जानते हुए कि TCP/IP विकल्प कैसे कॉन्फ़िगर किए जाते हैं, हम अपने विस्तार के कार्यान्वयन के लिए आगे बढ़ सकते हैं। सबसे आसान तरीका सॉकेट डिस्क्रिप्टर का संदर्भ प्राप्त करना होगा। उसके बाद, TCP/IP विकल्पों को सीधे इस डिस्क्रिप्टर पर हमारी अपनी नेटिव विधि मंगलाचरण के माध्यम से लागू किया जा सकता है। इस तरह, हम अभी भी जावा कोड से सामान्य तरीके से सॉकेट का उपयोग करने में सक्षम होंगे।

### JNA

चलिए सबसे नीचे से शुरू करते हैं। हम *setsockopt* फ़ंक्शन कॉल को लागू करने वाली C लाइब्रेरी को लोड करने के लिए JNA का उपयोग करेंगे। JNA दृष्टिकोण JNI में नेटिव गोंद कोड लिखने की तुलना में बहुत सरल और सुरक्षित दृष्टिकोण है। हम *pom.xml* (मेवेन) फ़ाइल में निम्नलिखित निर्भरता जोड़ेंगे:

```xml
<dependency>
    <groupId>net.java.dev.jna</groupId>
    <artifactId>jna</artifactId>
    <version>5.8.0</version>
</dependency>
```

हमारा उदाहरण एक लिनक्स सिस्टम के लिए होगा। विंडोज के लिए समकक्ष कोड पृष्ठ के निचले भाग में रिपॉजिटरी में पाया जा सकता है। लिनक्स के मामले में, सॉकेट कॉन्फ़िगरेशन को लागू करने वाली लाइब्रेरी को **libc** कहा जाता है। इस लाइब्रेरी को ( `lib` उपसर्ग को छोड़कर) लोड किया जा सकता है और JNA का उपयोग करके जावा इंटरफ़ेस के रूप में उजागर किया जा सकता है:

```java
package dev.termian.setsockopt.net.config;

import com.sun.jna.LastErrorException;
import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;

interface CSocket extends Library {
    CSocket INSTANCE = Native.load("c", CSocket.class);

    int IPPROTO_IP = 0; // grep IPPROTO_IP /usr/include/netinet/in.h
    int IP_MTU_DISCOVER = 10; // find /usr/include -name in.h | xargs grep IP_MTU_DISCOVER
    int IP_PMTUDISC_DONT = 0; // find /usr/include -name in.h | xargs grep IP_PMTUDISC_DONT
    int IP_PMTUDISC_WANT = 1; // find /usr/include -name in.h | xargs grep IP_PMTUDISC_WANT
    int IP_TTL = 2; // find /usr/include -name in.h | xargs grep IP_TTL
    
    int setsockopt(
            int socket,
            int level,
            int option_name,
            Pointer option_value,
            int option_len
    ) throws LastErrorException; // find /usr/include -name socket.h | xargs grep setsockopt

}
```

JNA हमें लाइब्रेरी इंटरफ़ेस को बहुत स्पष्ट तरीके से परिभाषित करने की अनुमति देता है। हमारी जरूरतों के लिए, हमें केवल *setsockopt* फ़ंक्शन की आवश्यकता है। इसके अतिरिक्त, हम व्यक्तिगत हेडर फ़ाइलों में पाए जाने वाले कुछ कॉन्फ़िगरेशन पैरामीटर परिभाषित करते हैं। उदाहरण के लिए, आइए IP DF (Don't Fragment) ध्वज और IP TTL (Time To Live) मान सेट करने का प्रयास करें।

```java
package dev.termian.setsockopt.net.config;

import com.sun.jna.ptr.IntByReference;

public class LinuxSocketConfigurer extends SocketConfigurer {

    public LinuxSocketConfigurer(Configuration configuration) {
        super(configuration);
    }

    @Override
    public void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment) {
        CSocket.INSTANCE.setsockopt(
                fileDescriptor.getFd(),
                CSocket.IPPROTO_IP,
                CSocket.IP_MTU_DISCOVER,
                new IntByReference(dontFragment ?
                        CSocket.IP_PMTUDISC_WANT :
                        CSocket.IP_PMTUDISC_DONT
                ).getPointer(),
                4
        );
    }

    @Override
    public void setTtl(FileDescriptorWrapper fileDescriptor, int ttl) {
        CSocket.INSTANCE.setsockopt(
                fileDescriptor.getFd(),
                CSocket.IPPROTO_IP,
                CSocket.IP_TTL,
                new IntByReference(ttl).getPointer(),
                4
        );
    }

}
```

लिनक्स के मामले में, संस्करण 2.2 से शुरू होकर, IP_MTU_DISCOVER विकल्प को IP_PMTUDISC_DONT मान के साथ पास करके DF ध्वज को सक्षम किया जा सकता है। JNA के साथ C लाइब्रेरी से एक फ़ंक्शन को कॉल करना बहुत सरल है। ध्यान दें कि JNA बफर संदर्भ को पास करना कितना सरल बनाता है। तुलना के लिए, C फ़ंक्शन इस तरह दिखता है:

```java
extern int setsockopt (
        int __fd,
        int __level,
        int __optname,
        const void *__optval,
        socklen_t __optlen
       ) __THROW;
```

### फ़ाइल डिस्क्रिप्टर

अब हमें केवल हमारे सॉकेट डिस्क्रिप्टर की आवश्यकता है। दुर्भाग्य से, मानक जावा पैकेजों के मामले में, यह डिस्क्रिप्टर इंटरफ़ेस का हिस्सा नहीं है। शॉर्टकट लेते हुए, हम रिफ्लेक्शन तंत्र का उपयोग कर सकते हैं। हालांकि, ध्यान दें कि कार्यान्वयन में बदलाव की स्थिति में यह जावा संस्करण अपग्रेड होने पर त्रुटियों का कारण बन सकता है।

वास्तविक संदर्भ *FileDescriptor* वर्ग के `fd` फ़ील्ड में निहित है:

```java
package dev.termian.setsockopt.net.impl;

import java.io.FileDescriptor;
import java.lang.reflect.Field;

public class FileDescriptorWrapper {

    private static final Field FD;

    static {
        try {
            FD = FileDescriptor.class.getDeclaredField("fd");
            FD.setAccessible(true);
        } catch (NoSuchFieldException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private final int fd;

    FileDescriptorWrapper(FileDescriptor fileDescriptor) throws IllegalAccessException {
        this.fd = FD.getInt(fileDescriptor);
    }

    public int getFd() {
        return fd;
    }

}
```

*FileDescriptor* ऑब्जेक्ट, जैसा कि पहले उल्लेख किया गया है, *Socket* या *SocketChannel* के विशिष्ट कार्यान्वयन से प्राप्त किया जा सकता है:

```java
package dev.termian.setsockopt.net.impl;

import dev.termian.setsockopt.net.factory.SocketChannelFactory;
import dev.termian.setsockopt.net.config.SocketConfigurer;

import java.io.FileDescriptor;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.channels.SocketChannel;

public class NativeSocketChannelFactory extends SocketChannelFactory {

    private static final Field SOCKET_CHANNEL_FD;

    static {
        try {
            Class<?> socketChannelImpl = Class.forName("sun.nio.ch.SocketChannelImpl");
            SOCKET_CHANNEL_FD = socketChannelImpl.getDeclaredField("fd");
            SOCKET_CHANNEL_FD.setAccessible(true);
        } catch (NoSuchFieldException | ClassNotFoundException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    private final SocketConfigurer socketConfigurer;

    public NativeSocketChannelFactory(SocketConfigurer socketConfigurer) {
        this.socketConfigurer = socketConfigurer;
    }

    @Override
    public SocketChannel open() throws IOException {
        SocketChannel socketChannel = SocketChannel.open();
        try {
            configure(socketChannel);
        } catch (Exception e) {
            try {
                socketChannel.close();
            } catch (IOException ignored) {
            }
            throw e;
        }
        return socketChannel;
    }

    @Override
    public void configure(SocketChannel socketChannel) throws IOException {
        FileDescriptorWrapper fileDescriptor = getFileDescriptor(socketChannel);
        socketConfigurer.setOptions(fileDescriptor);
    }

    private FileDescriptorWrapper getFileDescriptor(SocketChannel channel)
            throws IOException {
        try {
            FileDescriptor fileDescriptor = (FileDescriptor) SOCKET_CHANNEL_FD.get(channel);
            return new FileDescriptorWrapper(fileDescriptor);
        } catch (IllegalAccessException iae) {
            throw new IOException(iae);
        }
    }

}
```

### कॉन्फ़िगरेशन

आमतौर पर, कॉन्फ़िगरेशन को परिभाषित करने के लिए किसी प्रकार के बिल्डर का उपयोग किया जाता है। एक अधिक कार्यात्मक दृष्टिकोण में कॉन्फ़िगरेशन फ़ंक्शन के माध्यम से विकल्पों को लागू करना शामिल है:

```java
public interface Configurer {

    void setDontFragment(FileDescriptorWrapper fileDescriptor, boolean dontFragment)
            throws IOException;

    void setTtl(FileDescriptorWrapper fileDescriptor, int ttl) throws IOException;

}

public abstract class SocketConfigurer implements Configurer {

    private final Configuration configuration;

    public SocketConfigurer(Configuration configuration) {
        this.configuration = configuration;
    }

    public void setOptions(FileDescriptorWrapper fileDescriptor) throws IOException {
        configuration.apply(this, fileDescriptor);
    }

}

public interface Configuration {

    void apply(Configurer configurer, FileDescriptorWrapper fileDescriptor)
            throws IOException;

}
```

### क्लाइंट इंटरफ़ेस

एक स्थैतिक फ़ैक्टरी विधि के साथ हम एक ऐसा कार्यान्वयन प्राप्त कर सकते हैं जो हमारे प्लेटफ़ॉर्म के लिए विशिष्ट है:

```java
package dev.termian.setsockopt.net.factory;

import com.sun.jna.Platform;
import dev.termian.setsockopt.net.config.Configuration;
import dev.termian.setsockopt.net.config.LinuxSocketConfigurer;
import dev.termian.setsockopt.net.config.WindowsSocketConfigurer;
import dev.termian.setsockopt.net.impl.NativeSocketChannelFactory;

import java.io.IOException;
import java.nio.channels.SocketChannel;

public abstract class SocketChannelFactory {

    public static SocketChannelFactory getInstance(Configuration configuration) {
        switch (Platform.getOSType()) {
            case Platform.LINUX:
                return new NativeSocketChannelFactory(
                        new LinuxSocketConfigurer(configuration)
                );
            case Platform.WINDOWS:
                return new NativeSocketChannelFactory(
                        new WindowsSocketConfigurer(configuration)
                );
            default:
                throw new UnsupportedOperationException("Not implemented");
        }
    }

    public abstract SocketChannel open() throws IOException;
    public abstract void configure(SocketChannel socketChannel) throws IOException;

}
```

इस इंटरफ़ेस के क्लाइंट के रूप में, अब हम कार्यान्वयन में गहराई से जाने के बिना सॉकेट चैनल को कॉन्फ़िगर कर सकते हैं:

```java
public class SocketClient {
    public static void main(String[] args) throws IOException {
        SocketChannelFactory socketChannelFactory = SocketChannelFactory
                .getInstance((configurer, fileDescriptor) -> {
                    configurer.setDontFragment(fileDescriptor, false);
                    configurer.setTtl(fileDescriptor, 2);
                });

        try (SocketChannel channel = socketChannelFactory.open()) {
            Socket socket = channel.socket();
            InetSocketAddress address = new InetSocketAddress(
                    InetAddress.getLoopbackAddress(), Server.PORT
            );
            channel.connect(address);
            OutputStream outputStream = socket.getOutputStream();
            outputStream.write(new byte[5000]);
        }
    }
}
```

अंततः, हम इसे आसानी से किसी दिए गए क्लाइंट या लाइब्रेरी से जोड़ सकते हैं। कुछ युक्तियाँ जहाँ इस कार्यान्वयन को इंजेक्ट किया जा सकता है:
- Apache HttpClient:<br/> *HttpClientConnectionManager* ➜ *ConnectionSocketFactory* ➜ *createSocket()*;
- Apache AsyncHttpClient:<br/> *NHttpClientConnectionManager* ➜ *DefaultConnectingIOReactor* ➜ *prepareSocket()*;
- Netty: <br/> *Bootstrap* ➜ *channel()*.

इसी तरह, हम आसानी से अन्य नेटिव कार्यान्वयनों को कॉन्फ़िगर कर सकते हैं जो अभी भी सॉकेट डिस्क्रिप्टर और *setsockopt* की सुविधा प्रदान करते हैं। नीचे दिए गए लिंक किए गए रिपॉजिटरी में, आपको ऐसे एकीकरण मिलेंगे, जिसमें Netty *EpollSocketChannel* पर आधारित नेटिव समाधान के साथ बाइंडिंग भी शामिल है।

## सारांश

रिफ्लेक्शन तंत्र और JNA का उपयोग करके, हम बहुत अधिक काम किए बिना TCP/IP कनेक्शन के कॉन्फ़िगरेशन विकल्पों का विस्तार करने में सक्षम थे। हालांकि, यह एक आदर्श समाधान नहीं है। कुछ प्रमुख कमियों में शामिल हैं:
- जावा कार्यान्वयन मुद्दों पर निर्भरता जो समय के साथ बदल सकते हैं (जैसे `fd` का *DelegatingSocketImpl.delegate.fd* में जाना - JDK-8220493);
- रिफ्लेक्शन तंत्र का उपयोग करना, जो सुरक्षा सुनिश्चित नहीं करता है और हम हमेशा इसका उपयोग नहीं कर सकते (सुरक्षा प्रबंधक, `--illegal-access=deny` - जावा 16);
- कई प्लेटफार्मों के लिए समर्थन प्रदान करने में कठिनाई, और इसके अलावा, सभी सिस्टम समान कॉन्फ़िगरेशन विकल्प या समान तरीके से प्रदान नहीं करते हैं;
- एकीकरण परीक्षण में कठिनाई, सिस्टम एक्सेस (RAW_SOCK), या पैकेट स्निफर की आवश्यकता है।

हम उनमें से कुछ को रनटाइम वातावरण को एक सिद्ध कॉन्फ़िगरेशन तक सीमित करके, जैसे कि डॉकर का उपयोग करके, दूर कर सकते हैं। एक कारण है कि केवल व्यापक रूप से लागू कॉन्फ़िगरेशन विकल्प जावा द्वारा समर्थित हैं। अंत में, यदि आवश्यक हो, तो उसी तरह, हम सर्वर-साइड कॉन्फ़िगरेशन (*ServerSocket/ServerSocketChannel*) को लागू कर सकते हैं।

