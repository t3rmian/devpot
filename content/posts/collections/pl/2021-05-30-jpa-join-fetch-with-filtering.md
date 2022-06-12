---
title: JPQL JOIN FETCH z warunkiem
url: jpql-join-fetch-z-warunkiem
id: 67
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
  - hibernate
author: Damian Terlecki
date: 2021-05-30T20:00:00
---

Jednym z ciekawych zagadnień związanych z budowaniem zapytań JPQL (Java Persistence Query Language) z użyciem klauzuli JOIN FETCH
jest możliwość jednoczesnego zaciągnięcie w jednym zapytaniu jedynie wybranych elementów powiązanych z główną encją. 
Specyfikacja JPA w wersji 2.2 ([JSR 338](https://download.oracle.com/otn-pub/jcp/persistence-2_2-mrel-spec/JavaPersistence.pdf))
przedstawia następującą składnię dla zapytań JPQL z użyciem JOIN oraz JOIN FETCH.

```groovy
join::= join_spec join_association_path_expression [AS] identification_variable [join_condition]

fetch_join ::= join_spec FETCH join_association_path_expression

join_association_path_expression ::=
join_collection_valued_path_expression |
join_single_valued_path_expression |
TREAT(join_collection_valued_path_expression AS subtype) |
TREAT(join_single_valued_path_expression AS subtype)

join_collection_valued_path_expression::=
identification_variable.{single_valued_embeddable_object_field.}*collection_valued_field

join_single_valued_path_expression::=
identification_variable.{single_valued_embeddable_object_field.}*single_valued_object_field

join_spec::= [ LEFT [OUTER] | INNER ] JOIN

join_condition ::= ON conditional_expression
```

Możemy z niej wnioskować, że w przypadku JOIN FETCH nie jest możliwe nadanie aliasu ani zdefiniowanie warunków takiego łączenia.
Niemniej jednak, zarówno EclipseLink, jak i Hibernate jako implementacje specyfikacji JPA, w swoich rozszerzeniach JPQL – odpowiednio
EQL (EclipeLink Query Language) i HQL (Hibernate Query Language) dają programiście szersze pole do popisu.

Weźmy więc na tapet prosty model sklepu klient (1) – (N) zamówienie, w którym znając identyfikator zamówienia, chcielibyśmy pobrać
z bazy danych informacje o kliencie i tym właśnie zamówieniu za pomocą jednego zapytania.

```java
@Entity
@Table(name = "customers")
public class Customer {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    private String firstName;
    private String lastName;
    
    @OneToMany(mappedBy = "customer")
    private List<Order> orders;
    //...
}

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    @Column(name="CUSTOMERID")
    private Long customerId;

    @ManyToOne
    @JoinColumn(name = "CUSTOMERID", referencedColumnName = "ID", insertable = false, updatable = false)
    private Customer customer;
    //...
}
```

Dla zobrazowania wyników zapytań załóżmy następujący stan bazy danych:
```sql
[{Customer A, id=1, orders=[]},
 {Customer B, id=2, orders=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

## EQL JOIN FETCH z warunkiem

EclipseLink w przypadku JOIN FETCH umożliwia stosowanie zarówno warunku przy użyciu klauzuli ON, jak i zdefiniowanie takiego warunku
w klauzuli WHERE poprzez odwołanie do aliasu złączenia.

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10

SELECT c
FROM Customer c
JOIN FETCH c.orders o ON o.id = 10
```

EclipseLink wygeneruje następujące zapytanie SQL:

```sql
SELECT t1.ID, t1.FIRSTNAME, t1.LASTNAME, t0.ID, t0.CUSTOMERID
FROM orders t0, customers t1
WHERE ((t0.ID = ?) AND (t0.CUSTOMERID = t1.ID))
```

### Cache

To, czy EclipseLink zwróci nam klienta z ograniczoną listą zamówień jedynie do szukanego `[{Customer B, id=2, orders=[10]}]`
czy jednak wszystkie zamówienia klienta `[{Customer B, id=2, orders=[10, 14, 18, 22, 26, 30, 46, 47, 48, 49, 50, 51]}]`, zależy od
ustawień cache. Nie bez powodu w dokumentacji [JPQL EclipseLink](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Basic_JPA_Development/Querying/JPQL),
znalazła się następująca uwaga:
> JOIN FETCH normally does not allow an alias, but as of EclipseLink 2.4 an alias is allowed. The alias should be used with caution, as it can affect how the resulting objects are built. Objects should normally always have the same data, no matter how they were queried, this is important for caching and consistency.</br>This is only an issue if the alias is used in the WHERE clause on a collection relationship to filter the related objects that will be fetched. This should not be done, but is sometimes desirable, in which case the query should ensure it has been set to BYPASS the cache.

Przykładowo, jeśli w tej samej transakcji uprzednio odpytaliśmy bazę naszego klienta `SELECT c FROM Customers c WHERE c.id = 2` i został on zarejestrowany
w pamięci poziomu pierwszego (*EntityManager*) bądź mamy włączoną pamięć drugiego poziomu (*EntityManagerFactory*) i został on tam dodany na skutek
innej transakcji, to otrzymamy pełną listę zamówień klienta.

<img src="/img/hq/jpa-join-fetch-criteria.svg" alt="JPA Cache L1 i L2" title="JPA Cache L1 i L2">

Chcąc otrzymać listę z jednym zamówieniem w takim przypadku, na obiekcie typu *Query* należy dodać
wskazówkę, aby EclipseLink pominął zarówno cache L1, jak i L2 `query.setHint("eclipselink.maintain-cache", "false")`
podczas budowania obiektu. Jednocześnie kontekst nie zostanie zaśmiecony niepoprawnie zbudowanym z punktu widzenia JPA obiektem.

### Distinct

Jeśli po aplikacji warunku spodziewamy się zaciągnąć nie jedną, a N powiązanych encji to powinniśmy użyć klauzuli DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)

SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o ON o.id IN (10, 34, 49)
```

> **Uwaga:** Zwróć uwagę, aby nie używać nawiasów przy klauzuli DISTINCT np. DISTINCT(c). EclipseLink jest wyczulony na tym punkcie i wygeneruje dosyć wątpliwe zapytania, nawet z pominięciem warunku w przypadku opcji z ON:
```sql
SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t2, orders t1
WHERE ((t2.ID = ?) AND ((t2.CUSTOMERID = t0.ID) AND (t1.CUSTOMERID = t0.ID)))

SELECT DISTINCT t0.ID, t0.ADDRESSID, t0.FIRSTNAME, t0.LASTNAME, t1.ID, t1.CUSTOMERID
FROM customers t0, orders t1 WHERE (t1.CUSTOMERID = t0.ID)
```


## HQL JOIN FETCH z warunkiem

Podobnie jak w przypadku EclipseLink, Hibernate również wspiera zdefiniowanie warunku poprzez odniesienie do aliasu:

```sql
SELECT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id = 10
```

Jednakże opcja z warunkiem w klauzuli ON jest niedozwolona:

> java.lang.IllegalArgumentException: org.hibernate.hql.internal.ast.QuerySyntaxException: with-clause not allowed on fetched associations; use filters

### Cache

Również w przypadku Hibernate będziemy musieli wziąć pod uwagę możliwe problemy z cache. Aby nie zaśmiecać pamięci L1, jedną z opcji jest stworzenie
oddzielnej [sesji bezstanowej](https://docs.jboss.org/hibernate/orm/5.2/javadocs/org/hibernate/StatelessSession.html) na tym samym połączeniu. Sesja taka nie implementuje cache poziomu L1 i nie komunikuje się z L2:
```java
Session session = em.unwrap(Session.class);
SessionFactory sessionFactory = session.getSessionFactory();
List<Customer> customers = session.doReturningWork(connection -> {
    StatelessSession statelessSession = sessionFactory.openStatelessSession(connection);
    return statelessSession.createQuery("""
        SELECT c
        FROM Customer c
        JOIN FETCH c.orders o
        WHERE o.id = 10
        """, Customer.class).getResultList();
});
```

### Distinct 

Analogicznie, jeśli po aplikacji warunku spodziewamy się zaciągnąć nie jedną, a N powiązanych encji to należy dodać warunek DISTINCT:

```sql
SELECT DISTINCT c
FROM Customer c
JOIN FETCH c.orders o
WHERE o.id IN (10, 34, 49)
```

Tym samym wyeliminujemy problem zduplikowanych obiektów na poziomie rodzica (w tym przypadku klienta):
```sql
--Distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]}]
--Bez distinct:
[{Customer B, id=5, orders=[10, 49]},
 {Customer C, id=6, orders=[34]},
 {Customer B, id=5, orders=[10, 49]}]
```

Dodając wskazówkę "*hibernate.query.passDistinctThrough*" z wartością "*false*", dodatkowo pozbędziemy się klauzuli DISTINCT z samego
zapytania SQL. W ten sposób nieco odciążymy bazę, a Hibernate jednocześnie nie zapomni o deduplikacji.

## Podsumowanie

O ile specyfikacja JPA nie pozwala na ograniczanie powiązanych encji w przypadku klauzuli JOIN FETCH, to zarówno EclipseLink, jak i Hibernate oferują taką możliwość.
W obu przypadkach powinniśmy być jednak ostrożni przy budowie tego typu zapytań i wziąć pod uwagę problemy z cache oraz duplikacją zwracanych obiektów.
Będzie to również ważne w zależności od tego, czy potrzebujesz wyników jako obiektów zarządzanych, czy nie.