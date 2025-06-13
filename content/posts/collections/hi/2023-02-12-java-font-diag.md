---
title: Java फ़ॉन्ट विशेषक चिह्न समर्थन जांच
url: जावा-फॉन्ट-विशेषक-चिह्न-समर्थन
id: 104
category:
- java: जावा
tags:
- जे-शेल
- फॉन्ट्स
author: Damian Terlecki
date: 2023-02-12T20:00:00
---

एक जावा एप्लिकेशन होने पर जो इमेज टेक्स्ट या पीडीएफ उत्पन्न करता है, आप कभी-कभी समर्थित फ़ॉन्ट को सत्यापित करना चाह सकते हैं।
आमतौर पर, टेक्स्ट उत्पन्न करते समय, आप टाइपफेस (जैसे,
सेरिफ़, सैन्स-सेरिफ़, मोनोस्पेस्ड) और/या एक विशिष्ट फ़ॉन्ट नाम (जैसे, कंसोलस) चुन सकते हैं। एक
WYSIWYG संपादक न होने पर जो समान वातावरण और फ़ॉन्ट साझा करता है, आप लक्ष्य वातावरण पर उत्पन्न टेक्स्ट में प्रश्न चिह्नों
के साथ समाप्त हो सकते हैं। इस प्रकार, यह महत्वपूर्ण है कि फ़ॉन्ट कुछ साझा आधार
छवि के तहत डॉकराइज़्ड हों।

## जावा एडब्ल्यूटी फ़ॉन्ट्स

उपलब्ध फ़ॉन्ट्स और विशिष्ट वर्णों (जैसे विशेषक चिह्न) के लिए उनके समर्थन के त्वरित सत्यापन के लिए, AWT (एब्स्ट्रैक्ट विंडो टूलकिट) API पर एक नज़र डालें।
AWT पैकेज इंटरफेस जिनका उपयोग जावा लाइब्रेरी [फ़ॉन्ट लोड करने के लिए करती हैं](/posts/jre-font-loading) केवल फ़ॉन्ट लिस्टिंग से अधिक कर सकती हैं।
यह यह भी सत्यापित कर सकता है कि फ़ॉन्ट कुछ विशिष्ट वर्णों के प्रदर्शन का पूरी तरह से समर्थन करता है या नहीं।

ग्राफिकल वातावरण और फिर लोड किए गए फ़ॉन्ट्स की सूची प्राप्त करने के लिए, स्थैतिक फ़ंक्शन
`GraphicsEnvironment.getLocalGraphicsEnvironment()` का उपयोग करें और लौटाए गए ऑब्जेक्ट पर `getAllFonts()` विधि को कॉल करें।
हम फिर जांच सकते हैं (`canDisplayUpTo()`) कि क्या फ़ॉन्ट कुछ दिए गए टेक्स्ट को प्रदर्शित करने में सक्षम है। यदि यह -1 का मान लौटाता है,
तो पैरामीटर में निर्दिष्ट सभी वर्ण इस फ़ॉन्ट द्वारा समर्थित हैं।

```java
import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

class FontDiag {
    public static void main(String... args) {
        if (args == null || args.length != 1) {
            System.out.println("Usage: FontDiag.main(\"<your_font_characters>\")");
            return;
        }
        String fontCharacters = args[0];
        System.out.printf("Verifying which fonts support the following characters: %s%n%n", fontCharacters);
        GraphicsEnvironment environment = GraphicsEnvironment.getLocalGraphicsEnvironment();
        List<Font> fonts = Arrays.asList(environment.getAllFonts());
        fonts.sort(Comparator.comparing(Font::getFontName));
        List<Font> supportedFonts = new ArrayList<>();
        for (Font font : fonts) {
            if (font.canDisplayUpTo(fontCharacters) == -1) {
                supportedFonts.add(font);
            }
        }
        System.out.printf("All fonts: %s%n%n", fonts.stream().map(Font::getFontName).toList());
        System.out.printf("Supported fonts: %s%n%n", supportedFonts.stream().map(Font::getFontName).toList());
        System.out.printf("Supported font families: %s%n%n", supportedFonts.stream().map(Font::getFamily).collect(Collectors.toSet()));
    }
}
```

आप उपरोक्त प्रोग्राम को `javac` टूल का उपयोग करके संकलित कर सकते हैं और इसे सत्यापित किए जाने वाले वर्णों के साथ टेक्स्ट निर्दिष्ट करके चला सकते हैं `java FontDiag "abc"`।
प्रतिक्रिया में, यह सभी लोड किए गए फ़ॉन्ट प्रदर्शित करेगा और अंत में, केवल वे जो टेक्स्ट को पूरी तरह से प्रदर्शित कर सकते हैं, नामों
और परिवारों में विभाजित। इसे चलाने का सबसे आसान तरीका, हालांकि, इस प्रोग्राम को `jshell` में लागू करना है:

<img src="/img/hq/java-diacritics-support.svg" alt="एक डॉकर के अंदर लैटिन और जापानी वर्णों को प्रदर्शित कर सकने वाले फोंट के सत्यापन को दर्शाने वाला एनीमेशन" title="एक डॉकर में लैटिन और जापानी वर्णों को प्रदर्शित कर सकने वाले फोंट का सत्यापन">

