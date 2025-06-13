---
title: Tabela de junção (join table) somente leitura no JPA
url: jpa-tabela-de-juncao-somente-leitura
id: 80
category:
- jpa: JPA
tags:
  - sql
  - desempenho
  - eclipselink
  - hibernate
    author: Damian Terlecki
    date: 2022-02-20T20:00:00
---

As duas anotações JPA comumente usadas para mapear relacionamentos usando uma tabela de junção são *@JoinTable* e a
combinação de *@ElementCollection* e *@CollectionTable*. Em ambos os casos, elas são aplicadas ao lado que possui o
relacionamento. Todas as modificações no relacionamento representado pela tabela de junção são, por padrão, sincronizadas a partir do lado proprietário.

Desabilitar o comportamento de atualização da tabela de junção não é tão simples. Embora a anotação *@JoinTable*
contenha atributos *@JoinColumn* com as propriedades `updatable` e `insertable`, elas não afetam esse comportamento, ao contrário do caso de uma junção simples. Vamos verificar isso em um exemplo:

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

No exemplo acima, temos uma entidade de usuário simples com um relacionamento muitos-para-muitos na forma de um link mentor (usuário) — mentorado (usuário). Este relacionamento é mapeado de duas maneiras usando *@JoinTable* (lista de entidades) e *@ElementCollection* (lista de IDs de entidades). O cascateamento está desabilitado por padrão. Agora vamos tentar persistir dois objetos e adicionar um relacionamento entre eles:

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

Tanto para o Hibernate quanto para o EclipseLink, o *EntityManager* constrói e envia duas queries de inserção para adicionar um relacionamento à tabela de junção. Uma *RollbackException* é lançada.

Logs do Hibernate:
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

Logs do EclipseLink:
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

## Tabela de junção somente leitura

O exemplo acima não está totalmente correto do ponto de vista do JPA. No entanto, as implementações do JPA nos permitem modificar o relacionamento de uma forma que nos atenda.

### Hibernate

As interfaces `org.hibernate.persister.entity.EntityPersister` e `org.hibernate.persister.collection.CollectionPersister` com a anotação `org.hibernate.annotations.Persister` permitem definir uma lógica de mapeamento de entidade/elemento personalizada para um campo específico. Simplesmente estenda a classe *BasicCollectionPersister* definindo a flag `inverse` da coleção como `true` no construtor. Salvar, atualizar e excluir linhas da tabela de junção serão ignorados como se o relacionamento fosse de propriedade de outro lado.

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
Agora adicione a anotação *@Persister* apontando para o contrato de mapeamento, e o teste passará:

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

O Hibernate também fornece uma anotação `org.hibernate.annotations.Immutable`. No entanto, ela não se encaixa bem na nossa solução. Basicamente, ela impede que você remova e adicione itens de coleção para um objeto gerenciado, lançando uma exceção. Além do *BasicCollectionPersister*, você pode estender a classe *OneToManyPersister* se usar a anotação *@OneToMany*.

### EclipseLink

No caso do EclipseLink, você pode modificar as informações de mapeamento usando uma anotação em nível de tipo `org.eclipse.persistence.annotations.Customizer`. Esta anotação é um ponto de entrada para a implementação da interface `org.eclipse.persistence.config.DescriptorCustomizer`. Para obter um resultado semelhante no contexto de gerenciamento da tabela intermediária, podemos usar o recurso somente leitura. Embora você não possa adicionar a anotação *@ReadOnly* em um campo, você pode colocar o relacionamento no modo esperado durante a configuração do descritor.

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

Você pode aplicar o customizador na classe da entidade:

```java
//...
@Customizer(UserDescriptorCustomizer.class)
public class User extends Person { /*...*/ }
```

<img src="/img/hq/jpa-readonly-jointable.png" alt="JPA @JoinTable somente leitura" title="JPA @JoinTable somente leitura">
