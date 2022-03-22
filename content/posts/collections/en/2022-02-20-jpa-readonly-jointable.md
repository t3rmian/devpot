---
title: JPA read-only join table
url: jpa-readonly-jointable
id: 80
tags:
  - java
  - database
author: Damian Terlecki
date: 2022-02-20T20:00:00
---

The two JPA annotations commonly used to map relationships using a join table are *@JoinTable* and the
combination of *@ElementCollection* and *@CollectionTable*. In both cases, they are applied to the side that owns the
relationship. All modifications to the relationship represented by the join table are, by default, synchronized from the owner's side.

Disabling the behavior of updating the join table is not that simple. Even though the *@JoinTable*
annotation contains *@JoinColumn* attributes with `updatable` and `insertable` properties, they do not affect this behavior, contrary
to the case of a simple join. Let's check it on an example:

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

In the example above, we have a simple user entity with a many-to-many relationship in the form of a mentor (user) —
mentee (user) link. This relationship is mapped in two ways using *@JoinTable* (entity list) and *@ElementCollection* (entity ID
list). Cascading is disabled by default. Now let's try to persist two objects and add a relationship between them:

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

For both Hibernate and EclipseLink, *EntityManager* builds and sends two insert queries to add a relationship to the
join table. A *RollbackException* is thrown.

Hibernate logs:
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

EclipseLink logs:
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

## Read-only join table

The above example is not quite correct from the JPA point of view. Nevertheless, JPA implementations allow us to
modify the relationship in a way that will suit us.

### Hibernate

The `org.hibernate.persister.entity.EntityPersister` and `org.hibernate.persister.collection.CollectionPersister` interfaces
with `org.hibernate.annotations.Persister` annotation allow you to define a custom entity/element mapping logic
for a specified field. Simply extend the *BasicCollectionPersister* class setting the collection `inverse` flag to `true`
in the constructor. Saving, updating, and deleting join table rows will be skipped as if the
relationship was owned by another side.

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
Now add the *@Persister* annotation pointing to the mapping contract, and the test will pass:

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

Hibernate also provides an `org.hibernate.annotations.Immutable` annotation. However, it doesn't quite fit our solution.
Basically, it prevents you from removing and adding collection items for a managed object by throwing an exception. Besides the
*BasicCollectionPersister*, you can extend *OneToManyPersister* class if you use the *@OneToMany* annotation.

### EclipseLink

In the case of EclipseLink, you can modify the mapping information using a type-level
`org.eclipse.persistence.annotations.Customizer` annotation.
This annotation is an entry point for the implementation of `org.eclipse.persistence.config.DescriptorCustomizer` interface.
To obtain a similar result in the context of managing the intermediate table, we can use the read-only
feature. Although you cannot add *@ReadOnly* annotation on a field, you can put the relationship into the
expected mode during the descriptor configuration.

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

You can apply the customizer on the entity class:

```java
//...
@Customizer(UserDescriptorCustomizer.class)
public class User extends Person { /*...*/ }
```

<img src="/img/hq/jpa-readonly-jointable.png" alt="JPA read-only @JoinTable" title="JPA read-only @JoinTable">
