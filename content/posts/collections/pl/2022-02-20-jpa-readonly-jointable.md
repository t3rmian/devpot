---
title: JPA relacja tylko do odczytu poprzez tabelę pośrednią (join table)
url: jpa-readonly-jointable
id: 80
category:
- jpa: JPA
tags:
  - sql
  - wydajność
author: Damian Terlecki
date: 2022-02-20T20:00:00
---

Dwie najczęściej używane adnotacje JPA używane do zmapowania relacji przy użyciu tabeli pośredniej to
*@JoinTable* oraz połączenie *@ElementCollection* i *@CollectionTable*. W obu przypadkach aplikujemy je po stronie będącej
właścicielem relacji. Wszystkie modyfikacje samej relacji są standardowo aktualizowane od strony właściciela.

Wyłączenie aktualizacji wartości w samej tabeli pośredniej nie jest takie proste. 
Mimo tego, że w adnotacji *@JoinTable* znajdują się atrybuty typu *@JoinColumn* z właściwościami `updatable` i `insertable`
to jednak nie mają one wpływu na stan relacji w odróżnieniu do prostego łączenia. Sprawdźmy sobie to na przykładzie:


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
W powyższym przykładzie mamy prostą encję użytkownika wraz z relacją *many-to-many* w postaci mentor (użytkownik) — podopieczny (użytkownik).
Na dwa sposoby mapujemy tę relację przy użyciu *@JoinTable* (lista encji) oraz *@ElementCollection* (lista identyfikatorów encji).
Standardowo kaskadowość jest wyłączona. Spróbujemy teraz utrwalić dwa obiekty wraz z ich powiązaniem:

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

Zarówno w przypadku Hibernate, jak i EclipseLink, *EntityManager* zbuduje i wyśle dwa zapytania dodające relację do tabeli pośredniej.
Wyrzucony zostanie wyjątek *RollbackException*.

Logi z Hibernate:
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

Logi z EclipseLink:
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

## Tabela pośrednia tylko do odczytu

Powyższy przykład nie jest zbyt poprawny z punktu widzenia JPA. Mimo tego poszczególne implementacje pozwalają na modyfikacje relacji
w sposób, który będzie nam pasował.

### Hibernate

Interfejs `org.hibernate.persister.entity.EntityPersister` i `org.hibernate.persister.collection.CollectionPersister` wraz z adnotacją
`org.hibernate.annotations.Persister` pozwalają zdefiniować na danym polu niestandardową logikę mapowania encji/elementów w Hibernate.
Rozszerzając klasę bazową *BasicCollectionPersister*, wystarczy, że w konstruktorze na kolekcji przestawimy flagę `inverse` na `true`.
Zapisywanie, aktualizacja i usuwanie wierszy tabeli pośredniej będzie pomijane jakby właścicielem relacji była inna strona.

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
Dodając adnotację *@Persister* ze wskazaniem na nasz kontrakt na jednej z definicji kolekcji sprawi, że test przejdzie pomyślnie:
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

Hibernate swoją drogą oferuje adnotację `org.hibernate.annotations.Immutable`, działa ona jednak inaczej. Przede wszystkim
nie pozwala na usuwanie i dodawanie elementów kolekcji dla obiektu zarządzanego, co nie do końca pasuje do naszego problemu.
Poza *BasicCollectionPersister* możemy jeszcze wybrać *OneToManyPersister*, jeśli korzystamy z adnotacji *@OneToMany*.

### EclipseLink

Modyfikację informacji dotyczących mapowania w przypadku EclipseLink wykonać możemy przy użyciu adnotacji `org.eclipse.persistence.annotations.Customizer`
oraz interfejsu `org.eclipse.persistence.config.DescriptorCustomizer`. Do uzyskania podobnego rezultatu w kontekście aktualizacji
tabeli pośredniej, możemy skorzystać z funkcjonalności read-only. Chociaż sama adnotacja *@ReadOnly* tego nie pozwala,
to podczas konfiguracji deskryptora możemy samą relację przełączyć w oczekiwany tryb.


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

Aplikacja konfiguratora odbywa się na poziomie klasy encji:

```java
//...
@Customizer(UserDescriptorCustomizer.class)
public class User extends Person { /*...*/ }
```

<img src="/img/hq/jpa-readonly-jointable.png" alt="JPA read-only @JoinTable" title="JPA read-only @JoinTable">
