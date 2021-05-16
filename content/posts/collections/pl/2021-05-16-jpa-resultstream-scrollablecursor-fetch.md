---
title: JPQL JOIN FETCH i CursoredStream/ScrollableCursor
url: jpql-join-fetch-distinct-cursoredstream-scrollablecursor
id: 66
tags:
  - java
  - bazy danych
author: Damian Terlecki
date: 2021-05-16T20:00:00
---

W wersji 2.2 JPA do interfejsu *javax.persistence.Query* dodana została nowa metoda `Stream getResultStream()`, która pozwala
na łatwą implementację przetwarzania strumieniowego. Z założenia jednak to jak zaimplementowana jest ta metoda, pozostaje w gestii
providera JPA i najczęściej jest to po prostu wywołanie metody `stream()` na liście zwróconej przez `Query.getResultList()`:

```java
package javax.persistence;
/**/
public interface Query {
    /**
     * Execute a SELECT query and return the query results
     * as an untyped <code>java.util.stream.Stream</code>.
     * By default this method delegates to <code>getResultList().stream()</code>,
     * however persistence provider may choose to override this method
     * to provide additional capabilities.
     *
     * @return a stream of the results
     * @throws (...)
     * @see Stream
     * @see #getResultList()
     * @since 2.2
     */
    default Stream getResultStream() {
        return getResultList().stream();
    }
    /**/
}
```

Szukając rozwiązania dla przetwarzania dużej ilości rekordów oraz biorąc pod uwagę pamięć o skończonym obszarze, ładowanie całej listy
może nie być najlepszym pomysłem. Do tego celu świetnie sprawdzają się kursory, których odpowiednie wykorzystanie pozwala na
ograniczenie wykorzystania pamięci do stosunkowo niskiego poziomu. Przykładem tego typu kursorów są:
- *org.eclipse.persistence.queries.CursoredStream* – kursor w EclipseLink;
- *org.eclipse.persistence.queries.ScrollableCursor* – wielokierunkowy kursor w EclipseLink;
- *org.hibernate.ScrollableResults* – kursor w Hibernate.

Zakładając, że do naszego przetwarzania potrzebujemy zaciągnąć połączone ze sobą encje z kilku tabel, jedną z opcji jest
wykorzystanie operatora JPQL `[ LEFT [OUTER] | INNER ] JOIN FETCH join_association_path_expression`. JOIN FETCH
pozwala na pozbycie się problemu N+1, w którym dla zaciągniętej encji musimy jeszcze podociągać powiązane encje.
Od tego, jak to zrobimy, będzie w pewnym stopniu zależeć wydajność naszej aplikacji.

## EclipseLink CursoredStream/ScrollableCursor JOIN FETCH

Zasadniczo w EclipseLink oprócz JOIN FETCH mamy jeszcze do wyboru
dwa inne rozwiązania [(BatchFetchType EXISTS i IN)](https://java-persistence-performance.blogspot.com/2010/08/batch-fetching-optimizing-object-graph.html),
które są optymalne przy złożonych relacjach. W zamian za dodatkowe zapytanie (IN/EXISTS) dla każdej relacji, EL nie musi przetwarzać zduplikowanych rekordów wynikających z łączenia.
Alternatywy te niezbyt się jednak sprawdzają w przypadku kursora, gdzie dane musimy dociągać zazwyczaj po uzyskaniu każdego kolejnego obiektu.
W takim wypadku rozwiązanie z EXISTS i IN degraduje się do stanu wyjściowego z problemu N+1.

Jak można zauważyć, przy JOIN FETCH problemem są duplikaty. Biorąc pod uwagę prosty model sklepu: klient (1) -> (N) zamówienie
i poniższe zapytanie JPQL odwzorowujące relację **@OneToMany**:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
```
możemy spodziewać się, że EclipseLink wygeneruje pojedyncze zapytanie SQL:
```sql
SELECT t1.ID,
       t1.FIRSTNAME,
       t1.LASTNAME,
       t0.ID,
       t0.ADDRESSID,
       t0.CUSTOMERID,
FROM orders t0,
     customers t1
WHERE (t0.CUSTOMERID = t1.ID)
```
i zwróci listę zduplikowanych klientów, jeśli dokonali oni wielu zamówień:
```sql
[{Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer B, id=2, orders=[10, 14, 18, 46, 47, 48]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]},
 {Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}]
```

### JPQL DISTINCT SELECT

W przypadku JPQL rozwiązaniem problemu duplikatów jest użycie operatora DISTINCT na samej encji:
```sql
SELECT DISTINCT customer
FROM Customer customer
JOIN FETCH customer.orders
```

Tym sposobem przy użyciu jednego zapytania otrzymujemy zdeduplikowanych klientów wraz z ich zamówieniami:
```sql
[{Customer C, id=3, orders=[38, 42, 52, 53, 54, 34]},
 {Customer B, id=2, orders=[49, 50, 51, 22, 26, 10, 30, 46, 14, 47, 48, 18]}]
```
Skutkiem ubocznym jest dodanie operatora `DISTINCT` również do wygenerowanego zapytania SQL.
Hibernate radzi sobie z tym problemem poprzez dodanie właściwości [*hibernate.query.passDistinctThrough*](https://vladmihalcea.com/jpql-distinct-jpa-hibernate/),
natomiast w EclipseLinku nie znalazłem właściwego odpowiednika.

<img src="/img/hq/jpql-join-fetch-distinct.png" alt="JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();" title="EclipseLink JPQL JOIN FETCH getResultList(); -> org.eclipse.persistence.queries.ReadAllQuery.executeObjectLevelReadQuery();">

### CursoredStream/ScrollableCursor DISTINCT SELECT

Chcąc skorzystać z powyższej wiedzy o operatorze DISTINCT również w przypadku kursora *CursoredStream*, możemy się nieco zdziwić.

```java
Query query = em.createQuery("""
    SELECT DISTINCT customer
    FROM Customer customer
    JOIN FETCH customer.orders
""");
query.setHint("eclipselink.cursor", true); // org.eclipse.persistence.config.QueryHints.CURSOR
CursoredStream cursor = (CursoredStream) query.getSingleResult();
while (cursor.hasNext()) {
    System.out.println(cursor.next());
}
cursor.close();
```

Powyższy kod może nam wypisać podobne rezultaty:
```java
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer B, id=2, orders=[10]}
{Customer C, id=3, orders=[34, 38, 42, 52, 53, 54]}
{Customer B, id=2, orders=[10]}
/**/
```

Natomiast pomijając DISTINCT, możemy mieć szczęście i otrzymać zdeduplikowane rekordy. Dlaczego tak się dzieje?
Podstawową zasadą, na jakiej bazuje deduplikacja w *CursoredStream/ScrollableCursor* jest kolejność wartości klucza głównego w kolejnych wierszach
zwróconej odpowiedzi. Jeśli baza danych zwróci nam wiersze z tym samym kluczem głównym, porozrzucane po zestawie wyników, to
EclipseLink przetworzy je jako różne obiekty.

Do rozwiązania problemu wystarczy nam określenie kolejności sortowania:
```sql
SELECT customer
FROM Customer customer
JOIN FETCH customer.orders
ORDER BY customer.id
```

I w ten sposób otrzymamy ten sam rezultat co w przypadku `getResultList()`:
```java
{Customer B, id=2, orders=[10, 30, 46, 14, 47, 48, 18, 49, 50, 51, 22, 26]}
{Customer C, id=3, orders=[42, 52, 53, 54, 34, 38]}
```

Na koniec warto będzie jeszcze dokonfigurować nasz kursor:
- *QueryHints.SCROLLABLE_CURSOR* – pozwala zamienić na ScrollableCursor (możliwość poruszania się w tył);
- *QueryHints.RESULT_SET_TYPE* – definiuje kierunek kursora;
- *QueryHints.RESULT_SET_CONCURRENCY* – optymalizacja pod czytanie;
- *QueryHints.CURSOR_INITIAL_SIZE* – ustawia liczbę zaciąganych obiektów na pierwszej stronie kursora;
- *QueryHints.CURSOR_PAGE_SIZE* – ustawia liczbę dociąganych (metoda `next()`) obiektów, gdy bufor jest już pusty.
- *QueryHints.READ_ONLY* – jeśli nie potrzebujemy rejestracji w kontekście persistence (zmniejsza zużycie pamięci).
