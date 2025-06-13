---
title: JPA लेज़ी फ़ील्ड मर्ज
url: jpa-लेज़ी-फ़ेच-फ़ील्ड-का-विलय
id: 88
category:
- jpa: जेपीए
tags:
- इक्लिप्सलिंक
- प्रदर्शन
author: Damian Terlecki
date: 2022-06-12T20:00:00
---

JPA स्पेसिफिकेशन में, लेज़ी फेचिंग डेटाबेस में सहेजे गए फ़ील्ड्स और संबंधों तक पहुंच को ऑप्टिमाइज़ करने का एक तरीका है, जो दिए गए एट्रिब्यूट को कोड में संदर्भित किए जाने तक फेचिंग में देरी करता है। हाल ही में, मुझसे पूछा गया था कि जब हम लेज़ी-एनोटेटेड अन-फेच किए गए एट्रिब्यूट्स वाली एक एंटिटी को मर्ज करते हैं तो क्या होगा।

खोज में मिले शीर्ष परिणामों में से एक आपको StackOverflow पर एक पुराने [उत्तर](https://stackoverflow.com/questions/5244238/jpa-what-is-the-behaviour-of-merge-with-lazy-initialized-collection) पर ले जाएगा। वहां आपको एक ऐसे मामले से संबंधित प्रश्न मिलेगा जहां एंटिटी को DTO में मैप किया जाता है और फिर वापस मर्ज किया जाता है। दिए गए उदाहरण में, मैपर लेज़ी-फेच किए गए फ़ील्ड को छोड़ देता है, और परिणामस्वरूप संबंध/एट्रिब्यूट हटा दिया जाता है।

## लेज़ी एट्रिब्यूट रैपर

हालांकि, यदि आप लेज़ी-फेच किए गए फ़ील्ड को मैप करने का निर्णय लेते हैं तो एक अलग परिणाम प्राप्त होगा। यदि आप ऐसे एट्रिब्यूट्स तक पहुंचने का प्रयास करते हैं, तो JPA प्रोवाइडर DB से मानों को फेच करने का प्रयास करेगा। परसिस्टेंस कॉन्टेक्स्ट के बाहर (डेटाबेस से कनेक्शन के बाहर), आपको एक लेज़ी इनिशियलाइज़ेशन एक्सेप्शन मिलेगा।

दूसरी ओर, यदि आप फ़ील्ड को रेफरेंस द्वारा मैप करते हैं या सीरियलाइज़ेशन का उपयोग करते हैं, तो आप अपने फ़ील्ड पर एक प्रोवाइडर-विशिष्ट रैपर के साथ समाप्त होंगे। अब, क्या होगा जब ऐसा एट्रिब्यूट एक अलग परसिस्टेंस कॉन्टेक्स्ट में एक मर्ज ऑपरेशन में शामिल होता है? क्या आपको शायद फ़ील्ड को प्रीफेच करने की ज़रूरत है? स्पेसिफिकेशन यहाँ स्पष्ट है:

> [Jakarta Persistence](https://jakarta.ee/specifications/persistence/3.0/jakarta-persistence-spec-3.0.pdf)</br>3.2.7.1. Merging Detached Entity State: [...] परसिस्टेंस प्रोवाइडर को LAZY चिह्नित फ़ील्ड्स को मर्ज नहीं करना चाहिए जिन्हें फेच नहीं किया गया है: मर्ज करते समय इसे ऐसे फ़ील्ड्स को अनदेखा करना चाहिए। [...]</br>
> 3.2.7.2. Detached Entities and Lazy Loading: [...] एक वेंडर को डिटेच्ड एंटिटी इंस्टेंस के सीरियलाइज़ेशन और बाद में डीसीरियलाइज़ेशन और मर्जिंग का समर्थन करना आवश्यक है (जिसमें लेज़ी गुण या फ़ील्ड और/या संबंध हो सकते हैं जिन्हें फेच नहीं किया गया है) [...]

इस प्रकार, आउट ऑफ द बॉक्स, लेज़ी एट्रिब्यूट को जस का तस रहना चाहिए। आप एक साधारण इंटीग्रेशन टेस्ट चलाकर दोनों मामलों की पुष्टि कर सकते हैं:

```java
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceUnit;
import jakarta.persistence.Query;
import org.eclipse.persistence.exceptions.ValidationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.wildfly.common.Assert.assertFalse;
import static org.wildfly.common.Assert.assertTrue;

@SpringBootTest
public class LazyMergeTest {

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;

    private Product product; // owner of the cascaded lazy relation

    @BeforeEach
    public void setUp() {
        invokeInTransaction((em) -> Stream.of(
                "DELETE FROM stock WHERE product_id = 1",
                "DELETE FROM product WHERE id = 1",
                "INSERT INTO product (id, name) VALUES (1, 'Car')",
                "INSERT INTO stock (id, product_id, total) VALUES (1, 1, 10)"
        ).map(em::createNativeQuery).forEach(Query::executeUpdate));
    }

    @Test
    public void testMergeLazyField_InitializeAsEmptyInDTO() {
        invokeInTransaction((em) -> {
            product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertNotEquals("Test", product.getName());
        });

        product = new Product(product.getId());
        product.setName("Test");
        invokeInTransaction((entityManager) -> product = entityManager.merge(product));

        invokeInTransaction((em) -> {
            Product product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertEquals("Test", product.getName());
            assertTrue(product.getStocks().isEmpty()); // lazy relation unlinked on merge
            // [EL Fine]: (...) UPDATE STOCK SET product_id = ? WHERE ((product_id = ?) AND (ID = ?))
            // bind => [null, 1, 1]
        });
    }

    @Test
    public void testMergeLazyField_IgnoreOnMerge() {
        invokeInTransaction((em) -> {
            product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertNotEquals("Test", product.getName());
        });

        product = deserialize(serialize(product));
        var exception = assertThrows(ValidationException.class, () -> product.getStocks().isEmpty());
        var message = "An attempt was made to traverse a relationship using indirection that had a null Session";
        assertThat(exception.getMessage(), containsString(message));
        product.setName("Test");
        invokeInTransaction((em) -> product = em.merge(product));

        invokeInTransaction((em) -> {
            Product product = em.createQuery("SELECT p FROM Product p WHERE p.id = 1", Product.class)
                    .getSingleResult();
            assertEquals("Test", product.getName());
            assertFalse(product.getStocks().isEmpty()); // lazy field ignored ignored on merge
        });
    }

    private void invokeInTransaction(Consumer<EntityManager> transaction) {
        EntityManager em = entityManagerFactory.createEntityManager();
        em.getTransaction().begin();
        transaction.accept(em);
        em.getTransaction().commit();
    }


    private static byte[] serialize(Object object) {
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ObjectOutputStream out = new ObjectOutputStream(bos)) {
            out.writeObject(object);
            out.flush();
            return bos.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private static <T> T deserialize(byte[] bytes) {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(bytes);
             ObjectInputStream in = new ObjectInputStream(bis)) {
            return (T) in.readObject();
        } catch (IOException | ClassNotFoundException e) {
            throw new RuntimeException(e);
        }
    }
}
```

<img src="/img/hq/jpa-merge-on-lazy-fetch.png" alt="DTO या डीसीरियलाइज्ड द्वारा मैप किए गए लेज़ी-फेच फ़ील्ड पर JPA मर्ज के परिणाम" title="लेज़ी-फेच फ़ील्ड पर JPA मर्ज">

