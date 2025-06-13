---
title: readOnly (EclipseLink) क्वेरी के दौरान JPA @PostLoad
url: jpa-postload-readonly-eclipselink
id: 78
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - इक्लिप्सलिंक
author: Damian Terlecki
date: 2022-01-23T20:00:00
---
JPA 2.1 स्पेसिफिकेशन के अनुसार, `@PostLoad` से एनोटेट किए गए एंटिटी मेथड्स को कॉलबैक के रूप में उपयोग किया जाता है जब एंटिटी को डेटाबेस से लोड किया जाता है। अधिक सटीक रूप से, यह तब होता है जब एंटिटी को परसिस्टेंस कॉन्टेक्स्ट में लोड किया जाता है और जब रिफ्रेश को लागू किया जाता है। हालाँकि, एक गलत धारणा है कि यह मेथड हर बार जब हम डेटाबेस से डेटा प्राप्त करते हैं, तब कॉल किया जाएगा।

एंटिटी पर `@ReadOnly` एनोटेशन और EclipseLink कार्यान्वयन के लिए विशिष्ट `QueryHints.READ_ONLY` ("eclipselink.read-only") हिंट, दोनों ही हमें क्वेरी प्रोसेसिंग के दौरान परसिस्टेंस कॉन्टेक्स्ट को बायपास करने की अनुमति देते हैं। यह एक दिलचस्प ऑप्टिमाइज़ेशन विकल्प है जो बड़े डेटासेट को लोड करते समय हीप मेमोरी की खपत को कम करता है। साथ ही, यह हमें परसिस्टेंस यूनिट स्तर पर शेयर्ड कैश का उपयोग करने की अनुमति देता है। यह फैंसी है जब हमें एंटिटी को संशोधित करने की आवश्यकता नहीं होती है।

हालाँकि, जब उपरोक्त सुविधा का उपयोग किया जाता है, तो `@PostLoad` मेथड लागू नहीं होता है। एक स्थिति का उदाहरण देने के लिए, मैं इस तरह के मेथड के साथ एक साधारण एंटिटी का उपयोग करूंगा:

```java
package dev.termian.demo;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.eclipse.persistence.annotations.Customizer;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.PostLoad;
import javax.persistence.Table;
import javax.persistence.Transient;

@Getter
@Setter
@ToString(exclude = "id")
@Entity
@Table(name="users")
@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    @Transient
    private int index = 0;

    @PostLoad
    void postLoad() {
        index++;
    }

}
```

डेटाबेस से लोड करने के बाद `index` फ़ील्ड मान का परीक्षण दिखाता है कि *readOnly* क्वेरी के लिए मेथड को कॉल नहीं किया गया था:

```java
package dev.termian.demo;

import org.eclipse.persistence.config.HintValues;
import org.eclipse.persistence.config.QueryHints;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.transaction.Transactional;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest
class DemoApplicationTests {

    @PersistenceContext
    EntityManager em;

    @Test
    void testPostLoadReadOnly() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        query.setHint(QueryHints.READ_ONLY, HintValues.TRUE);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    @Test
    void testPostLoad() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    private void assertPostLoadExecutedOnce(List<User> users) {
        assertFalse(users.isEmpty());
        for (User user : users) {
            assertEquals(1, user.getIndex());
        }
    }

}
```

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="readOnly क्वेरी पर @PostLoad विधि लागू नहीं हुई" title="readOnly क्वेरी पर @PostLoad विधि कॉल नहीं की गई">

EL द्वारा लक्ष्य व्यवहार की कमी के कारण, हमें खुले बग रिपोर्ट [336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066) और [477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063) मिलते हैं। एक रिपोर्ट में, Jan Vermeulen [समझाता है](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0) कि यह समस्या EclipseLink कोड में कैसे तब्दील होती है। संक्षेप में, `@PostLoad` मेथड EclipseLink **clone** और **refresh** इवेंट्स से जुड़ा होता है जो तब होते हैं जब एक एंटिटी को कॉन्टेक्स्ट में लोड किया जाता है। हालाँकि, यह **build** इवेंट से नहीं जुड़ा है, जो आमतौर पर यूनिट ऑफ वर्क के बाहर होता है और संभावित रूप से समस्या को हल कर सकता है।

`@PostLoad` मेथड को परसिस्टेंस कॉन्टेक्स्ट के बाहर भी विस्तारित करने के लिए, हमें उस कोड तक पहुंचना होगा जो एंटिटी लाइफसाइकिल मेथड्स को EclipseLink इवेंट्स से जोड़ता है। प्रासंगिक ऑपरेशन परसिस्टेंस यूनिट इनिशियलाइज़ेशन के दौरान `EntityListener` क्लास में होता है। साथ ही, EL हमें परसिस्टेंस लेयर को और कॉन्फ़िगर करने के लिए एक API प्रदान करता है। निम्नलिखित इंटरफेस का उपयोग करके, हम अपना काम कर सकते हैं:
- `SessionCustomizer` परसिस्टेंस यूनिट स्तर पर परिभाषित;
- `DescriptorCustomizer` एंटिटी स्तर पर परिभाषित।

## SessionCustomizer

सत्र की शुरुआत आमतौर पर पहले एंटिटी मैनेजर (परसिस्टेंस कॉन्टेक्स्ट) के निर्माण से ठीक पहले होती है। इनिशियलाइज़ेशन के दौरान अंतिम चरणों में से एक कॉन्फ़िगरेशन है। इंटरफ़ेस हमें केवल एक कस्टमाइज़ मेथड प्रदान करता है जिसमें एक सत्र पैरामीटर होता है। सत्र से, हम एंटिटी डिस्क्रिप्टर्स (#1) के रूप में इनिशियलाइज़ किए गए मेटाडेटा को पढ़ सकते हैं जो इस प्रक्रिया के पिछले चरणों में पता चला था।

```java
package dev.termian.demo;

import org.eclipse.persistence.config.SessionCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {

    @Override
    public void customize(Session session) {
        for (ClassDescriptor classDescriptor : session.getDescriptors().values()) { // #1
            DescriptorEventListener entityEventListener = classDescriptor.getEventManager()
                    .getEntityEventListener();
            if (entityEventListener instanceof EntityListener) { // #2
                setPostLoadToPostBuild((EntityListener<?>) entityEventListener);
            }
        }
    }

    private void setPostLoadToPostBuild(EntityListener<?> listener) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods(); // #3
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE,
                Collections.emptyList()); // #4
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            listener.setPostBuildMethod(postLoad); // #5
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

*एंटिटी लिसनर* (#2) जो पहले खोजे गए क्लास से जुड़ा है, एंटिटी के संबंधित लाइफसाइकिल मेथड्स (#3) के संदर्भ रखता है। यह जानते हुए कि EclipseLink *POST_CLONE* इवेंट (#4) `@PostLoad` मेथड से जुड़ा है, हम इसे *POST_BUILD* इवेंट (#5) से भी जोड़ सकते हैं।

उपरोक्त समाधान में, एक [स्थिति](https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149) है जहाँ *postLoad* मेथड को दो बार कॉल किया जाएगा (*build* और *clone* के दौरान)। यह तब हो सकता है जब ऑब्जेक्ट्स को एक यूनिट ऑफ वर्क (परसिस्टेंस यूनिट) में क्लोन किया जाता है। मध्यवर्ती लिसनर (#6) के साथ, आप इस मामले को कवर कर सकते हैं और सशर्त रूप से (#7) *postBuild* को मूल लिसनर (#8) के *postClone* पर डेलीगेट कर सकते हैं:


```java
public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {
    //...
    private void setPostLoadToPostBuild(EntityListener<?> listener, ClassDescriptor classDescriptor) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods();
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE, Collections.emptyList());
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            classDescriptor.getEventManager().addListener(new DescriptorEventAdapter() { // #6
                @Override
                public void postBuild(DescriptorEvent event) {
                    if (!event.getSession().isUnitOfWork()) { // #7
                        listener.postClone(event); // #8
                    }
                }
            });
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

हम *persistence.xml* फ़ाइल में कॉन्फ़िगरेटर लागू करते हैं (उचित नेमस्पेस JPA संस्करण *2.x* और *3.x* के बीच भिन्न हो सकता है)। इसे `eclipselink.session.customizer` प्रॉपर्टी के तहत क्लास के पैकेज नाम प्रदान करके परिभाषित करें:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<persistence version="2.1" xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence 
             http://xmlns.jcp.org/xml/ns/persistence/persistence_2_1.xsd">
    <persistence-unit name="my-pu" transaction-type="RESOURCE_LOCAL">
        <!--...-->
        <properties>
            <!--...-->
            <property name="eclipselink.session.customizer"
                      value="dev.termian.demo.PostLoadOnReadOnlySessionCustomizer"/>
        </properties>
    </persistence-unit>
</persistence>
```

## DescriptorCustomizer

एक समान विस्तार को एंटिटी स्तर पर लागू किया जा सकता है। कॉन्फ़िगरेशन के समय, मानक `EntityListener` इस मामले में इनिशियलाइज़ नहीं किया जाएगा (#9)। हालाँकि, कुछ भी आपको कोड के आवश्यक भागों (#2, #7, #9) को इवेंट प्रोसेसिंग में ले जाने से नहीं रोकता है। वास्तव में, हम बिंदु #8 से उदाहरण को उसी तरह से रीफैक्टर कर सकते हैं।

```java
package dev.termian.demo;

import org.eclipse.persistence.config.DescriptorCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlyDescriptorCustomizer extends DescriptorEventAdapter implements DescriptorCustomizer {

    @Override
    public void customize(ClassDescriptor descriptor) {
        assert descriptor.getEventManager().getEntityEventListener() == null; // #9
        descriptor.getEventManager().addListener(this);
    }

    @Override
    public void postBuild(DescriptorEvent event) {
        // ((User)event.getSource()).postLoad();
        if (!event.getSession().isUnitOfWork()) {
            DescriptorEventListener entityEventListener = event.getDescriptor().getEventManager().getEntityEventListener();
            if (entityEventListener instanceof EntityListener) {
                EntityListener<?> entityListener = (EntityListener<?>) entityEventListener;
                entityListener.postClone(event);
            }
        }
    }

}
```

`org.eclipse.persistence.annotations.Customizer` एनोटेशन का उपयोग कस्टमाइज़र को लागू करने के लिए किया जा सकता है, यानी `@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)`। वैकल्पिक रूप से, आप इसे [परसिस्टेंस डिस्क्रिप्टर](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm) या EclipseLink [ORM डिस्क्रिप्टर](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC) के माध्यम से भी कर सकते हैं।

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="@PostLoad विधि POST_BUILD इवेंट से जुड़ी है" title="@PostLoad विधि POST_BUILD इवेंट से जुड़ी है">

ध्यान रखें कि इस नमूने में एक आंतरिक EclipseLink इंटरफ़ेस `org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener` का उपयोग किया गया था (EL 2.7.4)। इस निर्भरता को हटाने के लिए, आपको केवल `@PostLoad` एनोटेटेड मेथड्स को देखने का अपना तरीका खोजना होगा। ध्यान दें, हालाँकि, ऐसे मेथड्स `@MappedSuperclass` एनोटेशन से चिह्नित पैरेंट क्लास में भी पाए जा सकते हैं।

