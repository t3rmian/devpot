---
title: JPA 読み取り専用結合テーブル
url: jpa-読み取り専用-結合テーブル
id: 80
category:
- jpa: JPA
tags:
- sql
- パフォーマンス
- eclipselink
- hibernate
author: Damian Terlecki
date: 2022-02-20T20:00:00
---

結合テーブルを使用してリレーションシップをマッピングするために一般的に使用される2つのJPAアノテーションは、*@JoinTable*と
*@ElementCollection*と*@CollectionTable*の組み合わせです。どちらの場合も、これらはリレーションシップを所有する側に適用されます。
結合テーブルで表されるリレーションシップへのすべての変更は、デフォルトで所有者側から同期されます。

結合テーブルの更新動作を無効にすることは、それほど単純ではありません。*@JoinTable*
アノテーションには`updatable`と`insertable`プロパティを持つ*@JoinColumn*属性が含まれていますが、単純な結合の場合とは異なり、これらはこの動作に影響を与えません。例で確認してみましょう。

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

上記の例では、メンター（ユーザー）—
メンティー（ユーザー）という形式の多対多リレーションシップを持つ単純なユーザーエンティティがあります。このリレーションシップは、*@JoinTable*（エンティティリスト）と*@ElementCollection*（エンティティIDリスト）を使用して2つの方法でマッピングされています。
カスケードはデフォルトで無効です。次に、2つのオブジェクトを永続化し、それらの間にリレーションシップを追加してみましょう。

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

HibernateとEclipseLinkの両方で、*EntityManager*は結合テーブルにリレーションシップを追加するために2つのinsertクエリを構築して送信します。*RollbackException*がスローされます。

Hibernateのログ:
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

EclipseLinkのログ:
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

## 読み取り専用結合テーブル

上記の例はJPAの観点からはあまり正しくありません。それでも、JPA実装は、私たちに合った方法でリレーションシップを変更することを可能にします。

### Hibernate

`org.hibernate.persister.entity.EntityPersister`と`org.hibernate.persister.collection.CollectionPersister`インターフェースと`org.hibernate.annotations.Persister`アノテーションを組み合わせることで、指定されたフィールドのカスタムエンティティ/要素マッピングロジックを定義できます。
*BasicCollectionPersister*クラスを拡張し、コンストラクタでコレクションの`inverse`フラグを`true`に設定するだけです。
結合テーブルの行の保存、更新、削除は、リレーションシップが別の側によって所有されているかのようにスキップされます。

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
ここで、マッピング契約を指す*@Persister*アノテーションを追加すると、テストはパスします。

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

Hibernateは`org.hibernate.annotations.Immutable`アノテーションも提供していますが、我々の解決策にはあまり合いません。
基本的には、例外をスローすることで、管理対象オブジェクトのコレクションアイテムの削除や追加を防ぎます。*BasicCollectionPersister*の他に、*@OneToMany*アノテーションを使用する場合は*OneToManyPersister*クラスを拡張できます。

### EclipseLink

EclipseLinkの場合、型レベルの`org.eclipse.persistence.annotations.Customizer`アノテーションを使用してマッピング情報を変更できます。
このアノテーションは、`org.eclipse.persistence.config.DescriptorCustomizer`インターフェースの実装へのエントリポイントです。
中間テーブルの管理という文脈で同様の結果を得るために、読み取り専用機能を使用できます。
フィールドに*@ReadOnly*アノテーションを追加することはできませんが、ディスクリプタ設定中にリレーションシップを期待されるモードにすることができます。

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

エンティティクラスにカスタマイザーを適用できます。

```java
//...
@Customizer(UserDescriptorCustomizer.class)
public class User extends Person { /*...*/ }
```

<img src="/img/hq/jpa-readonly-jointable.png" alt="JPA 読み取り専用@JoinTable" title="JPA 読み取り専用@JoinTable">

