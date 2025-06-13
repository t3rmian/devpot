---
title: OWASP Java HTML सैनिटाइज़र की CSS स्कीमा प्रॉपर्टीज़ को ओवरराइड या मर्ज कैसे करें
url: ओवास्प-जावा-एचटीएमएल-सैनिटाइज़र-स्टाइल-ओवरराइड
id: 127
category:
- java: जावा
tags:
- सुरक्षा
- एचटीएमएल
author: Damian Terlecki
date: 2024-04-07T20:00:00
---


[`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer)
शायद Java में थर्ड-पार्टी XSS HTML से सुरक्षा के लिए सबसे परिपक्व समाधानों में से एक है।
यह `org.owasp.html.Sanitizers` पैकेज में परिभाषित बुनियादी प्रीपैकेज्ड पॉलिसियों के साथ आता है
और `org.owasp.html.examples` के तहत अधिक जटिल पॉलिसियाँ मिलती हैं।
आप `org.owasp.html.HtmlPolicyBuilder` के माध्यम से पूर्वनिर्धारित या कस्टम स्टाइल के साथ अपनी खुद की पॉलिसी भी बना सकते हैं।

## CSS स्टाइल प्रॉपर्टी के लिए डुप्लिकेट असंगत परिभाषाएँ

OWASP Java HTML सैनिटाइज़र की एक बाधा यह है कि आप सार्वजनिक API का उपयोग करके पहले से परिभाषित CSS स्टाइल प्रॉपर्टी को ओवरराइड नहीं कर सकते।
उदाहरण के लिए `CssSchema.DEFAULT` को लें। यह `allowStyling()` के साथ बनाई गई पॉलिसी के लिए अप्रत्यक्ष रूप से उपयोग किया जाता है और यह सभी नेगेटिव-मार्जिन प्रॉपर्टीज़ को फ़िल्टर कर देता है:

```java
import org.junit.Test;
import org.owasp.html.CssSchema;
import org.owasp.html.CssSchemaUtils;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class SanitizerTest {

    @Test
    public void givenAllowDefaultStyling_whenSanitize_thenRemoveNegativeMargin() {
        String sanitizedContent = new HtmlPolicyBuilder()
                .allowStyling()
                .allowElements("div")
                .toFactory()
                .sanitize("""
                        <div style="margin-left:10px;margin-top:-10px"/>
                        """);
        assertEquals("""
                <div style="margin-left:10px">
                </div>""", sanitizedContent);
    }
}
```

> नमूने संस्करण `20240325.1` पर आधारित हैं, हालाँकि Guava के प्रतिस्थापन से पहले के पुराने संस्करण जो Java कलेक्शन फ्रेमवर्क के साथ थे, समान दिखते हैं।
> इस संस्करण के साथ `java8-shim` पैक भी आता है। इसमें `org.owasp.shim.Java8Shim` यूटिल्स शामिल हैं जो Java 10 कलेक्शन फैक्ट्रियों के लिए एडेप्टर प्रदान करते हैं
> जिन्हें आप Java 8 के साथ उपयोग कर सकते हैं।

मान लीजिए आप एक नेगेटिव `margin-top` प्रॉपर्टी की अनुमति देना चाहते हैं और साथ ही डिफ़ॉल्ट CSS स्कीमा का पुन: उपयोग करना चाहते हैं।
आप केवल इस प्रॉपर्टी के साथ अपनी खुद की स्कीमा बनाते हैं, लेकिन इसे सार्वजनिक API - `CssSchema.union()` या `PolicyFactory.and()` - का उपयोग करके डिफ़ॉल्ट वाले के साथ संयोजित करने
से एक `IllegalArgumentException` होता है:

```java
//...
public class SanitizerTest {
    //...
    private final static CssSchema.Property NEGATIVE_MARGIN_TOP_PROPERTY =
            new CssSchema.Property(
                    CssSchemaUtils.BIT_QUANTITY | CssSchemaUtils.BIT_NEGATIVE, // allowed value group types (constants exposed from CssSchema)
                    Set.of("auto", "inherit"), // allowed literals
                    Map.of() // map of CSS function start tokens like "rgb(" to another schema property key like "rgb()" that defines its arguments
            );
    private final static CssSchema CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP =
            CssSchema.withProperties(Map.of(
                    "margin-top",
                    NEGATIVE_MARGIN_TOP_PROPERTY
            ));

    @Test
    public void givenDefaultCssSchema_whenUnion_thenIllegalArgumentException() {
        assertThrows("Duplicate irreconcilable definitions for margin-top",
                IllegalArgumentException.class,
                () -> new HtmlPolicyBuilder().allowStyling(CssSchema.union(
                        CssSchema.DEFAULT,
                        CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP
                ))
        );
    }

    @Test
    public void givenDefaultCssSchemaPolicy_whenUnion_thenIllegalArgumentException() {
        PolicyFactory negativeMarginTopPolicy = new HtmlPolicyBuilder()
                .allowStyling(CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP)
                .toFactory();
        assertThrows("Duplicate irreconcilable definitions for margin-top",
                IllegalArgumentException.class,
                () -> new HtmlPolicyBuilder()
                        .allowStyling(CssSchema.DEFAULT)
                        .toFactory().and(negativeMarginTopPolicy)
        );
    }
}
```

> कस्टम प्रॉपर्टी को कैसे परिभाषित किया जाए, इस पर अधिक नमूनों के लिए `CssSchema` में विभिन्न पूर्वनिर्धारित प्रॉपर्टीज़ पर एक नज़र डालें।

## CssSchema को ओवरराइड करना

सैनिटाइज़र का अधिकांश कार्यान्वयन अंतिम है।
सौभाग्य से, आप पूरी स्कीमा परिभाषा को कॉपी और संशोधित किए बिना इस सख्त सत्यापन को बायपास कर सकते हैं।
संक्षिप्त सार्वजनिक API के अलावा, `CssSchema` उसी पैकेज के तहत अपना स्वयं का
एक्सटेंशन लिखने के लिए पर्याप्त पैकेज-प्राइवेट इंटरफेस उजागर करता है।

`CssSchema.allowedProperties()`, `CssSchema.forKey()`, और `CssSchema.withProperties()` के माध्यम से
आप आसानी से एक ओवरराइड स्कीमा बना सकते हैं। संयोग से, आप प्रॉपर्टी प्रकारों को परिभाषित करने के लिए आवश्यक स्थिरांक भी उजागर कर सकते हैं,
या तो संकलन या रनटाइम स्थिरांक के रूप में।

> लाइब्रेरी में एक कंपाइल-टाइम स्थिरांक परिवर्तन के लिए आपके कोड का पुनर्संकलन आवश्यक होगा।
> दूसरी ओर, कस्टम CSS प्रॉपर्टी बनाने के लिए व्यवहारिक असंगति के कारण ऐसा परिवर्तन असंभावित होगा।
> इसे बाइनरी संगतता संरक्षित होने पर स्रोत/व्यवहारिक असंगति से बचाने के बारे में एक रोचक जानकारी के रूप में मानें।

```java
package org.owasp.html;

import java.lang.invoke.MethodHandles;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public class CssSchemaUtils {

    public static final int BIT_QUANTITY = CssSchema.BIT_QUANTITY; // compile-time constant
    public static final int BIT_NEGATIVE;

    static {
        try { // or a runtime constant
            BIT_NEGATIVE = (int) MethodHandles.lookup().in(CssSchema.class)
                    .findStaticVarHandle(CssSchema.class, "BIT_NEGATIVE", int.class)
                    .get();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    /* other BIT_.. constants */

    public static CssSchema override(CssSchema... cssSchemas) {
        if (cssSchemas.length == 1) {
            return cssSchemas[0];
        }
        Map<String, CssSchema.Property> properties = Maps.newLinkedHashMap();
        for (CssSchema cssSchema : cssSchemas) {
            for (String name : cssSchema.allowedProperties()) {
                if (Objects.isNull(name)) {
                    throw new NullPointerException("An entry was returned with null key from cssSchema.properties");
                }
                CssSchema.Property newProp = cssSchema.forKey(name);
                if (Objects.isNull(newProp)) {
                    throw new NullPointerException("An entry was returned with null value from cssSchema.properties");
                }
                properties.put(name, newProp);
            }
        }
        return CssSchema.withProperties(properties);
    }
}
```

इस ज्ञान के साथ, आप अन्य मर्जिंग रणनीतियों को भी लागू कर सकते हैं।
एक नज़र डालें कि यह क्रिया में कैसा दिखता है:


```java
//...
public class SanitizerTest {
    //...
    @Test
    public void givenDefaultCssSchemaPolicyPackageOverrideNegativeMargin_whenSanitize_thenAllowNegativeMargin() {
        String sanitizedContent = new HtmlPolicyBuilder()
                .allowStyling(CssSchemaUtils.override(
                        CssSchema.DEFAULT,
                        CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP
                ))
                .allowElements("div")
                .toFactory()
                .sanitize("""
                        <div style="margin-left:10px;margin-top:-10px"/>
                        """);
        assertEquals("""
                <div style="margin-left:10px;margin-top:-10px">
                </div>""", sanitizedContent);
    }
}
```

`CssSchema` के विपरीत, चयनित `PolicyFactory` स्टाइल को ओवरराइड करने का कोई साफ तरीका नहीं लगता है।
उदाहरण के लिए, `EbayPolicyExample` को अलग-अलग स्टाइलिंग के साथ परीक्षण करने के लिए, आपको पूरी परिभाषा को कॉपी करना होगा और इसे अलग से बनाए रखना होगा,
लेकिन कम से कम अंतर्निहित `CssSchema.DEFAULT` के लिए ऐसा करने की आवश्यकता नहीं होगी।

<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="OWASP Java HTML सैनिटाइज़र स्टाइल ओवरराइड टेस्ट के परिणाम" title="OWASP Java HTML सैनिटाइज़र स्टाइल ओवरराइड टेस्ट के परिणाम">

अपनी खुद की नीतियां परिभाषित करने की तरह, बहुत सावधान रहें।
[सुरक्षा पर अन्य प्रभावों](https://github.com/OWASP/java-html-sanitizer/pull/184) की संभावना पर विचार करें।
सफेद-सूचीबद्ध गुणों के साथ इंटरैक्शन को समझें और अपने संदर्भों में उपयोग को सत्यापित करें।
