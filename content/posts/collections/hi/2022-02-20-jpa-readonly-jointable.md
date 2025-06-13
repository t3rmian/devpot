---
title: JPA रीड-ओनली जॉइन टेबल
url: jpa-रीड-ओनली-जॉइन-टेबल
id: 80
category:
- jpa: जेपीए
tags:
  - एसक्यूएल
  - प्रदर्शन
  - इक्लिप्सलिंक
  - हाइबरनेट
author: Damian Terlecki
date: 2022-02-20T20:00:00
---

दो JPA एनोटेशन जो आमतौर पर एक जॉइन टेबल का उपयोग करके संबंधों को मैप करने के लिए उपयोग किए जाते हैं, वे हैं *@JoinTable* और *@ElementCollection* और *@CollectionTable* का संयोजन। दोनों ही मामलों में, वे उस पक्ष पर लागू होते हैं जो संबंध का स्वामी है। जॉइन टेबल द्वारा दर्शाए गए संबंध में सभी संशोधन, डिफ़ॉल्ट रूप से, स्वामी के पक्ष से सिंक्रनाइज़ किए जाते हैं।

जॉइन टेबल को अपडेट करने के व्यवहार को अक्षम करना इतना सरल नहीं है। भले ही *@JoinTable* एनोटेशन में `updatable` और `insertable` गुणों के साथ *@JoinColumn* विशेषताएँ हों, वे इस व्यवहार को प्रभावित नहीं करती हैं, जो एक साधारण जॉइन के मामले के विपरीत है। आइए इसे एक उदाहरण पर जांचें:

```java
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToMany;
import javax.persistence.Table;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name="users")
@ToString(exclude = "id", callSuper = true)
public class User extends Person {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;

    @ManyToMany
    @JoinTable(name = "mentored_users",
            joinColumns = {@JoinColumn(name = "mentee_user_id",
                    insertable = false, updatable = false)},
            inverseJoinColumns = {@JoinColumn(name = "mentor_user_id",
                    insertable = false, updatable = false)}
    )
    private List<User> mentors = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "mentored_users",
            joinColumns = {@JoinColumn(name = "mentee_user_id")}
    )
    @Column(name = "mentor_user_id")
    private List<Long> mentorIds = new ArrayList<>();


    public void addMentor(User mentor) {
        mentors.add(mentor);
        mentorIds.add(mentor.getId());
    }

}
```

उपरोक्त उदाहरण में, हमारे पास एक साधारण उपयोगकर्ता एंटिटी है जिसमें मेंटर (उपयोगकर्ता) — मेंटी (उपयोगकर्ता) लिंक के रूप में एक अनेक-से-अनेक संबंध है। यह संबंध *@JoinTable* (एंटिटी सूची) और *@ElementCollection* (एंटिटी आईडी सूची) का उपयोग करके दो तरीकों से मैप किया गया है। कैस्केडिंग डिफ़ॉल्ट रूप से अक्षम है। अब आइए दो ऑब्जेक्ट्स को बनाए रखने और उनके बीच एक संबंध जोड़ने का प्रयास करें:

```java
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.PersistenceUnit;
import javax.persistence.Query;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.hamcrest.MatcherAssert.*;
import static org.hamcrest.Matchers.*;

@SpringBootTest
public class ReadOnlyCollectionTest {

    @PersistenceUnit
    EntityManagerFactory entityManagerFactory;
    EntityManager entityManager;

    @BeforeEach
    public void setUp() {
        entityManager = entityManagerFactory.createEntityManager();
    }

    @Test
    public void testReadOnlyJoinTablePersist() {
        User mentor = new User();
        mentor.setName("ALICE");

        User mentee = new User();
        mentee.setName("BOB");

        entityManager.getTransaction().begin();
        entityManager.persist(mentor);
        mentee.addMentor(mentor);
        entityManager.persist(mentee);
        entityManager.getTransaction().commit();

        List<Map<String, Object>> mentors = getMentorJoinTable();
        assertThat(mentors, hasSize(1));
        assertThat(mentors.get(0), hasEntry(
                equalToIgnoringCase("mentor_user_id"),
                anyOf(// Long or BigInteger depending on dialect
                        equalToObject(mentor.getId()),
                        equalTo(BigInteger.valueOf(mentor.getId()))
                )
        ));
        assertThat(mentors.get(0), hasEntry(
                equalToIgnoringCase("mentee_user_id"),
                anyOf(
                        equalToObject(mentee.getId()),
                        equalTo(BigInteger.valueOf(mentee.getId()))
                )
        ));
    }

    // Hibernate
    private List<Map<String, Object>> getMentorJoinTable() {
        Query nativeQuery = entityManager.createNativeQuery("SELECT * FROM mentored_users");
        org.hibernate.query.Query<?> hibernateQuery = (org.hibernate.query.Query<?>) nativeQuery;
        hibernateQuery.setResultTransformer(org.hibernate.transform.AliasToEntityMapResultTransformer.INSTANCE);
        //noinspection unchecked
        return nativeQuery.getResultList();
    }
    
    // EclipeLink
    private List<Map<String, Object>> getMentorJoinTable() {
        //noinspection unchecked
        return entityManager.createNativeQuery("SELECT * FROM mentored_users")
                .setHint(
                        org.eclipse.persistence.config.QueryHints.RESULT_TYPE,
                        org.eclipse.persistence.config.ResultType.Map
                )
                .getResultList();
    }
}
```

Hibernate और EclipseLink दोनों के लिए, *EntityManager* जॉइन टेबल में एक संबंध जोड़ने के लिए दो इंसर्ट क्वेरी बनाता और भेजता है। एक *RollbackException* फेंका जाता है।

Hibernate लॉग्स:
```sql
2022-02-20 14:39:40.533 DEBUG 2760 --- [main] org.hibernate.SQL                        : 
    
values
    identity_val_local()
Hibernate: 
    
values
    identity_val_local()
2022-02-20 14:39:40.554 DEBUG 2760 --- [main] org.hibernate.SQL                        : 
    /* insert collection
        row User.mentorIds */ insert 
        into
            mentored_users
            (mentee_user_id, mentor_user_id) 
        values
            (?, ?)
Hibernate: 
    /* insert collection
        row User.mentorIds */ insert 
        into
            mentored_users
            (mentee_user_id, mentor_user_id) 
        values
            (?, ?)
2022-02-20 14:39:40.558 TRACE 2760 --- [main] o.h.type.descriptor.sql.BasicBinder      : binding parameter [1] as [BIGINT] - [6]
2022-02-20 14:39:40.558 TRACE 2760 --- [main] o.h.type.descriptor.sql.BasicBinder      : binding parameter [2] as [BIGINT] - [5]
2022-02-20 14:39:40.559 DEBUG 2760 --- [main] org.hibernate.SQL                        : 
    /* insert collection
        row User.mentors */ insert 
        into
            mentored_users
            (mentee_user_id, mentor_user_id) 
        values
            (?, ?)
Hibernate: 
    /* insert collection
        row User.mentors */ insert 
        into
            mentored_users
            (mentee_user_id, mentor_user_id) 
        values
            (?, ?)
2022-02-20 14:39:40.562 TRACE 2760 --- [main] o.h.type.descriptor.sql.BasicBinder      : binding parameter [1] as [BIGINT] - [6]
2022-02-20 14:39:40.562 TRACE 2760 --- [main] o.h.type.descriptor.sql.BasicBinder      : binding parameter [2] as [BIGINT] - [5]
2022-02-20 14:39:40.570  WARN 2760 --- [main] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Error: 20000, SQLState: 23505
2022-02-20 14:39:40.570 ERROR 2760 --- [main] o.h.engine.jdbc.spi.SqlExceptionHelper   : The statement was aborted because it would have caused a duplicate key value in a unique or primary key constraint or unique index identified by 'SQL220220143939760' defined on 'MENTORED_USERS'.

```

EclipseLink लॉग्स:
```sql
[EL Fine]: sql: 2022-02-20 15:19:14.204--ClientSession(1679352734)--Connection(488422671)--Thread(Thread[main,5,main])--INSERT INTO mentored_users (mentee_user_id, mentor_user_id) VALUES (?, ?)
	bind => [6, 5]
[EL Finest]: query: 2022-02-20 15:19:14.21--ClientSession(1679352734)--Thread(Thread[main,5,main])--Execute query DataModifyQuery(name="mentors" )
[EL Fine]: sql: 2022-02-20 15:19:14.21--ClientSession(1679352734)--Connection(488422671)--Thread(Thread[main,5,main])--INSERT INTO mentored_users (mentor_user_id, mentee_user_id) VALUES (?, ?)
	bind => [5, 6]
[EL Fine]: sql: 2022-02-20 15:19:14.224--ClientSession(1679352734)--Thread(Thread[main,5,main])--VALUES(1)
[EL Warning]: 2022-02-20 15:19:14.232--ClientSession(1679352734)--Thread(Thread[main,5,main])--Local Exception Stack: 
Exception [EclipseLink-4002] (Eclipse Persistence Services - 2.7.10.v20211216-fe64cd39c3): org.eclipse.persistence.exceptions.DatabaseException
Internal Exception: org.apache.derby.shared.common.error.DerbySQLIntegrityConstraintViolationException: The statement was aborted because it would have caused a duplicate key value in a unique or primary key constraint or unique index identified by 'SQL220220151913200' defined on 'MENTORED_USERS'.
Error Code: 20000
Call: INSERT INTO mentored_users (mentor_user_id, mentee_user_id) VALUES (?, ?)
	bind => [5, 6]
```

## रीड-ओनली जॉइन टेबल

उपरोक्त उदाहरण JPA के दृष्टिकोण से बिल्कुल सही नहीं है। फिर भी, JPA कार्यान्वयन हमें संबंध को इस तरह से संशोधित करने की अनुमति देते हैं जो हमारे लिए उपयुक्त होगा।

### Hibernate

`org.hibernate.persister.entity.EntityPersister` और `org.hibernate.persister.collection.CollectionPersister` इंटरफेस `org.hibernate.annotations.Persister` एनोटेशन के साथ आपको एक निर्दिष्ट फ़ील्ड के लिए एक कस्टम एंटिटी/एलिमेंट मैपिंग लॉजिक को परिभाषित करने की अनुमति देते हैं। बस *BasicCollectionPersister* क्लास का विस्तार करें और कंस्ट्रक्टर में संग्रह `inverse` ध्वज को `true` पर सेट करें। जॉइन टेबल पंक्तियों को सहेजना, अपडेट करना और हटाना छोड़ दिया जाएगा जैसे कि संबंध दूसरे पक्ष के स्वामित्व में था।

```java
import org.hibernate.MappingException;
import org.hibernate.cache.CacheException;
import org.hibernate.cache.spi.access.CollectionDataAccess;
import org.hibernate.mapping.Collection;
import org.hibernate.persister.collection.BasicCollectionPersister;
import org.hibernate.persister.spi.PersisterCreationContext;

public class ReadOnlyCollectionPersister extends BasicCollectionPersister {
    private static Collection asInverse(Collection collection) {
        collection.setInverse(true);
        return collection;
    }

    public ReadOnlyCollectionPersister(
            Collection collectionBinding,
            CollectionDataAccess cacheAccessStrategy,
            PersisterCreationContext creationContext) throws MappingException,
            CacheException {
        super(asInverse(collectionBinding), cacheAccessStrategy, creationContext);
    }
}
```
अब *@Persister* एनोटेशन को मैपिंग कॉन्ट्रैक्ट की ओर इशारा करते हुए जोड़ें, और टेस्ट पास हो जाएगा:

```java
    //...
    @ManyToMany
    @JoinTable(name = "mentored_users",
            joinColumns = {@JoinColumn(name = "mentee_user_id")},
            inverseJoinColumns = {@JoinColumn(name = "mentor_user_id")}
    )
    @Persister(impl = ReadOnlyCollectionPersister.class)
    private List<User> mentors = new ArrayList<>();
    //...
```

Hibernate एक `org.hibernate.annotations.Immutable` एनोटेशन भी प्रदान करता है। हालाँकि, यह हमारे समाधान में पूरी तरह से फिट नहीं बैठता है। मूल रूप से, यह एक अपवाद फेंककर एक प्रबंधित ऑब्जेक्ट के लिए संग्रह आइटम को हटाने और जोड़ने से रोकता है। *BasicCollectionPersister* के अलावा, यदि आप *@OneToMany* एनोटेशन का उपयोग करते हैं तो आप *OneToManyPersister* क्लास का विस्तार कर सकते हैं।

### EclipseLink

EclipseLink के मामले में, आप एक प्रकार-स्तर `org.eclipse.persistence.annotations.Customizer` एनोटेशन का उपयोग करके मैपिंग जानकारी को संशोधित कर सकते हैं। यह एनोटेशन `org.eclipse.persistence.config.DescriptorCustomizer` इंटरफ़ेस के कार्यान्वयन के लिए एक प्रवेश बिंदु है। मध्यवर्ती तालिका के प्रबंधन के संदर्भ में एक समान परिणाम प्राप्त करने के लिए, हम रीड-ओनली सुविधा का उपयोग कर सकते हैं। हालाँकि आप किसी फ़ील्ड पर *@ReadOnly* एनोटेशन नहीं जोड़ सकते हैं, आप डिस्क्रिप्टर कॉन्फ़िगरेशन के दौरान संबंध को अपेक्षित मोड में डाल सकते हैं।

```java
import org.eclipse.persistence.config.DescriptorCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;

public class UserDescriptorCustomizer implements DescriptorCustomizer {
    @Override
    public void customize(ClassDescriptor descriptor) {
        descriptor.getMappingForAttributeName("mentors").setIsReadOnly(true);
    }
}
```

आप एंटिटी क्लास पर कस्टमाइज़र लागू कर सकते हैं:

```java
//...
@Customizer(UserDescriptorCustomizer.class)
public class User extends Person { /*...*/ }
```

<img src="/img/hq/jpa-readonly-jointable.png" alt="JPA रीड-ओनली @JoinTable" title="JPA रीड-ओनली @JoinTable">

