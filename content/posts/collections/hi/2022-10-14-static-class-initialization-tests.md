---
title: स्टैटिक ब्लॉक/क्लास इनिशियलाइज़ेशन टेस्ट
url: स्टैटिक-ब्लॉक-क्लास-इनिशियलाइज़ेशन-टेस्ट
id: 97
category:
- java: जावा
- testing: टेस्टिंग
tags:
- क्लासलोडिंग
- जेयूनिट
- पॉवरमॉक
author: Damian Terlecki
date: 2022-10-16T20:00:00
---

स्थैतिक वर्ग आरंभीकरण ब्लॉक में तर्क अक्सर आसानी से परीक्षण योग्य नहीं होता है।
ऐसे परीक्षणों के लिए अतिरिक्त पुस्तकालयों या एक प्रतिबिंब तंत्र के उपयोग की आवश्यकता होती है, जो उनके चलने के समय और पठनीयता को महत्वपूर्ण रूप से बढ़ाता है।
कभी-कभी, हालांकि, रिफैक्टरिंग एक विकल्प नहीं है। यह एक बाहरी पुस्तकालय या एक विरासत कोड हो सकता है जिसका कोई पिछला परीक्षण नहीं है।
ऐसी समस्या का सामना करते समय, यह जानना अच्छा है कि ऐसे स्थैतिक तर्क का परीक्षण कैसे किया जाए।

## स्थैतिक कोड वाली कक्षा
विशेष रूप से समस्याग्रस्त कोड में पर्यावरणीय मापदंडों के आधार पर सशर्त तर्क होगा।
सरल बनाने के लिए, एक उदाहरण के रूप में, मैं एक सिस्टम पैरामीटर के साथ प्रारंभ किए गए एक स्थैतिक क्षेत्र के साथ एक वर्ग का उपयोग करूंगा:
```java
public class SomeStaticInitializationClass {
    public static final String FOO = System.getProperty("FOO");
}
```
परीक्षणों का उद्देश्य इस पैरामीटर के मान को विभिन्न इनपुट मानों के विरुद्ध सत्यापित करना होगा।
एक अधिक जटिल मामले में, हम ऐसे पैरामीटर/पर्यावरण की स्थिति पर निर्भर कुछ तर्क के परिणाम का परीक्षण करेंगे, जो अक्सर `static {/***/}` ब्लॉक में निहित होता है।

ऐसे कोड का परीक्षण करने की समस्या परीक्षणों/कक्षाओं को लोड करने के तरीके से उत्पन्न होती है।
परीक्षण चलाकर, हम यह सुनिश्चित कर सकते हैं कि कक्षा एक बार लोड हो जाएगी।
आप एक से अधिक इनपुट पैरामीटर के लिए तर्क का परीक्षण करने में सक्षम नहीं होंगे:

```java
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runners.MethodSorters;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;


@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class SomeStaticInitializationClassATest {
    @Test
    public void testGetFoo_A() {
        System.setProperty("FOO", "A");
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }

    @Test
    public void testGetFoo_B_SameClassLoader() {
        System.setProperty("FOO", "B");
        assertNotEquals("B", SomeStaticInitializationClass.FOO);
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }
}
```

बाद के परीक्षण, अलग-अलग कक्षाओं में घोषणाओं के बावजूद, समस्या को और जटिल करते हैं।
आप एक अलग तरह से प्रारंभ की गई कक्षा की उम्मीद कर सकते हैं।
```java
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

public class SomeStaticInitializationClassBTest {
    @Test
    public void testGetFoo_B_SameClassloader() {
        System.setProperty("FOO", "B");
        assertNotEquals("B", SomeStaticInitializationClass.FOO);
        assertEquals("A", SomeStaticInitializationClass.FOO);
    }
}
```

परीक्षणों (या परीक्षण सूट) के क्रम के आधार पर आपको अलग-अलग परिणाम मिलेंगे।
कभी-कभी आप एक नया परीक्षण शुरू करके अन्य परीक्षणों को भी तोड़ सकते हैं।
```java
@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img src="/img/hq/test-class-initialization-testsuite.png" alt="सही क्रम में परीक्षणों को लागू करने का परिणाम" title="सही क्रम में परीक्षणों को लागू करने का परिणाम">
<img src="/img/hq/test-class-initialization-order.png" alt="गलत क्रम में परीक्षणों को लागू करने का परिणाम" title="गलत क्रम में परीक्षणों को लागू करने का परिणाम">


## प्रति परीक्षण अलग JVM उदाहरण

एक तरकीब यह है कि परीक्षणों को जावा वर्चुअल मशीन के अलग-अलग उदाहरणों में चलाने के लिए मजबूर किया जाए।
इस तरह, आप यह सुनिश्चित कर सकते हैं कि परीक्षण की गई कक्षा परीक्षण घोषित करने वाली प्रति कक्षा एक बार लोड हो जाएगी।
हालांकि समाधान संभव है (उदाहरण के लिए मानक `maven-surefire-plugin` के `forkCount` और `reuseForks` को कॉन्फ़िगर करके) यह उप-इष्टतम है।
हर बार कक्षाओं को लोड करने के उद्देश्य से एक अलग प्रक्रिया बनाई जाती है, परीक्षण निष्पादन समय में काफी वृद्धि होती है।
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <version>2.16</version>
    <configuration>
        <forkCount>1</forkCount>
        <reuseForks>false</reuseForks>
    </configuration>
</plugin>
```
सीधे IDE के माध्यम से परीक्षण लागू करते समय परीक्षण निष्पादन के प्रतिनिधिमंडल को Maven को चालू करना याद रखें।
सामान्य तौर पर, क्लास लोडिंग मुद्दे के आसपास काम करने की कोशिश करने के बजाय परीक्षणों को समानांतर बनाने और तेज करने के लिए फोर्क का लाभ उठाएं।

## एक अलग ClassLoader का उपयोग करके परीक्षण की गई कक्षा को लोड करना

बुनियादी परीक्षणों के लिए, हालांकि, हम क्लास लोडिंग और मानक *ClassLoader* इंटरफ़ेस के ज्ञान का उपयोग कर सकते हैं।
हम जानते हैं कि हम क्या हासिल करना चाहते हैं - क्लास को फिर से लोड करना। जबकि मानक *ClassLoader* ऐसी कार्यक्षमता प्रदान नहीं करता है,
आप इसे आसानी से अपनी आवश्यकता के अनुसार बढ़ा सकते हैं।

```java
import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;

class TestClassLoader extends URLClassLoader {

    private final Class<?>[] filteredClasses;

    public TestClassLoader(ClassLoader parent, Class<?> ...filteredClasses) {
        super(getClassPath(), parent);
        this.filteredClasses = filteredClasses;
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        for (Class<?> filteredClass : filteredClasses) {
            if (filteredClass.getName().equals(name)) {
                Class<?> c = this.findLoadedClass(name);
                if (c == null) {
                    c = this.findClass(name);
                }

                if (resolve) {
                    this.resolveClass(c);
                }

                return c;
            }
        }
        return super.loadClass(name, resolve);
    }

    private static URL[] getClassPath() {
        String classpath = System.getProperty("java.class.path");
        String[] entries = classpath.split(File.pathSeparator);
        URL[] result = new URL[entries.length];
        try {
            for (int i = 0; i < entries.length; i++) {
                result[i] = Paths.get(entries[i]).toAbsolutePath().toUri().toURL();
            }
        } catch (MalformedURLException e) {
            throw new RuntimeException();
        }
        return result;
    }
}
```

यह जानते हुए कि परीक्षण की गई कक्षा *क्लासपाथ* (सिस्टम पैरामीटर में निहित) में मौजूद है, हमें बस *URLClassLoader* का उपयोग करने की आवश्यकता है।
लोडिंग के विवरण के लिए सुपरक्लास देखें, और प्रतिनिधिमंडल को उल्टा करें।
शेष कक्षाओं की लोडिंग को पैरेंट *ClassLoader* को सौंपें। लोड की गई कक्षा होने पर, हम प्रतिबिंब तंत्र का उपयोग करके स्थैतिक क्षेत्र को पढ़ सकते हैं:

```java

import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runners.MethodSorters;

import java.io.IOException;
import java.lang.reflect.Field;
import java.net.URLClassLoader;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;


@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class SomeStaticInitializationClassATest {
    //...
    @Test
    public void testGetFoo_B_SeparateClassLoader() throws IOException, ClassNotFoundException, NoSuchFieldException, IllegalAccessException {
        System.setProperty("FOO", "B");
        assertEquals("B", getClassField(SomeStaticInitializationClass.class, "FOO"));
    }

    private Object getClassField(Class<?> loadedClass, String name) throws IOException, ClassNotFoundException, NoSuchFieldException, IllegalAccessException {
        try (URLClassLoader urlClassLoader = new TestClassLoader(getClass().getClassLoader(), loadedClass)) {
            Class<?> aClass = urlClassLoader.loadClass(loadedClass.getName());
            Field declaredField = aClass.getDeclaredField(name);
            return declaredField.get(null);
        }
    }
}
```

## एक अलग ClassLoader का उपयोग करके परीक्षण कक्षा को लोड करना

जैसा कि आप अनुमान लगा सकते हैं, प्रतिबिंब बहुत सुविधाजनक नहीं है, खासकर यदि आप अधिक फ़ील्ड्स को संदर्भित करना चाहते हैं या किसी ऑब्जेक्ट को प्रारंभ करना चाहते हैं।
एक कदम आगे बढ़ते हुए, इस मुद्दे से छुटकारा क्यों न लिया जाए? यदि आप एक कस्टम *ClassLoader* के माध्यम से परीक्षण कक्षा को लोड करते हैं, तो परीक्षण कक्षा को भी उसी *ClassLoader* द्वारा खींचा जाएगा।

इसके लिए सबसे अच्छा शुरुआती बिंदु `@RunWith` एनोटेशन है।
यह परीक्षणों को लागू करने के लिए तंत्र को परिभाषित करता है।
मानक कार्यान्वयन का विस्तार करते हुए, आपको इसके कंस्ट्रक्टर में परीक्षण कक्षा को बस पास करने की अनुमति देता है।
हमें बस इतना करना है कि हम अपने स्वयं के *ClassLoader* को यहाँ हुक करें, यह याद रखते हुए कि इसे केवल परीक्षण समाप्त होने के बाद ही बंद करना है।
इसे बहुत जल्दी बंद करने से परीक्षण के तहत कक्षा लोड नहीं हो सकती है।

```java
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runner.notification.RunNotifier;
import org.junit.runners.BlockJUnit4ClassRunner;
import org.junit.runners.model.InitializationError;
import org.junit.runners.model.Statement;

import static org.junit.Assert.assertEquals;

@RunWith(SomeStaticInitializationClassCTest.SeparateClassLoaderTestRunner.class)
public class SomeStaticInitializationClassCTest {
    @Test
    public void testGetFoo_C_SeparateTestClassLoader() {
        System.setProperty("FOO", "C");
        assertEquals("C", SomeStaticInitializationClass.FOO);
    }

    public static class SeparateClassLoaderTestRunner extends BlockJUnit4ClassRunner {
        private static final TestClassLoader testClassLoader = new TestClassLoader(SeparateClassLoaderTestRunner.class.getClassLoader(),
                SomeStaticInitializationClassCTest.class, SomeStaticInitializationClass.class);
        
        public SeparateClassLoaderTestRunner(Class<?> clazz) throws InitializationError, ClassNotFoundException {
            super(testClassLoader.loadClass(clazz.getName()));
        }

        @Override
        protected Statement classBlock(RunNotifier notifier) {
            Statement statement = super.classBlock(notifier);
            return new Statement() {
                @Override
                public void evaluate() throws Throwable {
                    try {
                        statement.evaluate();
                    } finally {
                        testClassLoader.close();
                    }
                }
            };
        }
    }
}
```

## पॉवरमॉक लाइब्रेरी

अंत में, आइए समस्या के लिए एक दर्जी समाधान पर एक नज़र डालें, यानी पॉवरमॉक परीक्षण पुस्तकालय।

```xml
<dependency>
    <groupId>org.powermock</groupId>
    <artifactId>powermock-module-junit4</artifactId>
    <version>2.0.9</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.powermock</groupId>
    <artifactId>powermock-api-mockito2</artifactId>
    <version>2.0.9</version>
    <scope>test</scope>
</dependency>
```

बस `org.powermock.modules.junit4.PowerMockRunner` रनर का उपयोग करके, आप परीक्षण कक्षा को एक अलग *ClassLoader* द्वारा लोड करने का कारण बनेंगे।

```java
import org.junit.Test;
import org.junit.runner.RunWith;
import org.powermock.modules.junit4.PowerMockRunner;

import static org.junit.Assert.assertEquals;

@RunWith(PowerMockRunner.class)
public class SomeStaticInitializationClassETest {
    @Test
    public void testGetFoo_E_SeparatePowerMockClassLoader() {
        System.setProperty("FOO", "E");
        assertEquals("E", SomeStaticInitializationClass.FOO);
    }
}
```

इस समाधान का स्पष्ट नुकसान, फिर से, परीक्षणों के निष्पादन से जुड़ा काफी समय ओवरहेड है।
दूसरी ओर, उपकरण कई अन्य विरासत परीक्षण मामलों (जैसे अंतिम कक्षाओं का मज़ाक उड़ाना) में मदद करता है।

```java
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
        SomeStaticInitializationClassATest.class,
        SomeStaticInitializationClassBTest.class,
        SomeStaticInitializationClassCTest.class,
        SomeStaticInitializationClassDTest.class,
        SomeStaticInitializationClassETest.class,
})
public class SomeStaticInitializationClassTestSuite {
}
```

<img loading="lazy" src="/img/hq/test-class-initialization-times.png" alt="क्लास इनिशियलाइज़ेशन परीक्षणों को लागू करने का परिणाम" title="क्लास इनिशियलाइज़ेशन परीक्षणों को लागू करने का परिणाम">

> **ध्यान दें:** उपरोक्त उदाहरण JUnit 4 API का उपयोग करते हैं जो अक्सर विरासत परियोजनाओं के मौजूदा परीक्षण ढांचे से मेल खाता है। JUnit 5 के लिए, आप इसे विंटेज इंजन के साथ उपयोग कर सकते हैं या ज्यूपिटर इंजन के साथ व्यवहार (परीक्षण क्लास लोडिंग) को सत्यापित कर सकते हैं।
