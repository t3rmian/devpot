---
title: JPA CriteriaBuilder i natywny SQL w EclipseLink
url: jpa-criteriabuilder-native-sql-eclipselink
id: 64
category:
- jpa: JPA
tags:
  - sql
author: Damian Terlecki
date: 2021-04-18T20:00:00
---

Podczas korzystania z *CriteriaBuildera* w JPA prędzej czy później natkniemy się na pewne ograniczenia wynikające ze specyfikacji. Przykładowym problemem może
okazać się zdefiniowanie ograniczenia na ilość zwracanych rekordów w podzapytaniu bądź zmiana kolejności sortowania wartości NULL. EclipseLink jako alternatywa
dla Hibernate, oferuje w takiej sytuacji całkiem przyjemną abstrakcję w postaci interfejsu *JpaCriteriaBuilder* oraz klasy *ExpressionBuilder*.

## Zapytanie TOP N

Zapytanie TOP N, to standardowe zapytanie, w którym chcemy wyciągnąć z bazy danych N rekordów, najczęściej posortowanych względem interesującego nas atrybutu.
Przykładowo, może nas interesować 5 najlepiej ocenianych produktów (składnia bazy danych H2):

```sql
SELECT id, name FROM products ORDER BY rating LIMIT 3;
```

Takie zapytanie z łatwością zbudujemy przy pomocy klasy *CriteriaBuilder*, do której referencję otrzymujemy z *EntityManagera*
(a właściwie przy pomocy `CriteriaQuery.orderBy()` oraz `Query.setMaxResults()`).
W przypadku, gdy chcemy je umieścić jako podzapytanie, sprawa się komplikuje.

Obecna wersja JPA 2.2 nie udostępnia nam takiej możliwości.
Możemy oczywiście rozbić nasz problem na dwa zapytania bądź, rozważyć rozwiązanie natywne. EclipseLink dostarcza nam jednak pomocną
w tej sytuacji klasę *ExpressionBuilder*.

ExpressionBuilder to klasa wykorzystywana przez wewnętrzne komponenty EclipseLinka. Co ważne z punktu widzenia klienta zwraca
obiekty typu *Expression*, które pasują do interfejsu *CriteriaBuildera*.
Szczególnie użyteczną metodą tej klasy jest `public Expression sql(String sql, List arguments)`.

Jako pierwszy parametr możemy podać natywne zapytanie SQL, a po dostarczeniu argumentów poprzez drugi parametr metody, funkcja
zwróci nam obiekt, który możemy wykorzystać w zależności od przeznaczenia – jako podzapytanie, warunek czy listę atrybutów.

## CriteriaBuilder – podzapytanie TOP N

Wyobraźmy sobie prosty sklep – klientów, zamówienia i produkty. Załóżmy, że chcemy odnaleźć wszystkich klientów, którzy
zamówili jeden z trzech najgorzej ocenianych produktów. Być może chcielibyśmy dać im rabat, aby nasz sklep źle się im nie
kojarzył. Uproszczony diagram klas takiego sklepiku mógłby wyglądać następująco:

<img src="/img/hq/expressionbuilder-eclipselink.svg" alt="Diagram klas dla przykładowego zapytania TOP N" title="Uproszczony diagram klas">

Oczekiwane zapytanie TOP N, które powinien wygenerować nam *CriteriaBuilder* to:

```sql
SELECT t0.id, t0.firstname, t0.lastname
FROM customer t0
WHERE EXISTS(SELECT 1
             FROM orders t1
             WHERE ((t0.id = t1.customer_id)
                 AND (t1.product_id IN (SELECT id
                                        FROM products
                                        ORDER BY rating LIMIT 3))))
```

Zaczniemy standardowo od *EntityManagera*, którego zapewne wstrzykniemy w zależności od platformy.
Z *ExpressionBuildera* skorzystamy w najbardziej zagnieżdżonym zapytaniu:

```java
import org.springframework.transaction.annotation.Transactional;

import javax.persistence.EntityManager;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Root;
import javax.persistence.criteria.Subquery;
import java.util.Collections;
/*...*/
public class MyService {
    /*...*/    
    @Transactional(readOnly = true)
    public List<Customer> findCustomersWithBadProducts() {
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Customer> criteriaQuery = criteriaBuilder.createQuery(Customer.class);
        Root<Customer> customer = criteriaQuery.from(Customer.class);
        Subquery<Order> orderSubQuery = criteriaQuery.subquery(Order.class);
        Root<Order> order = orderSubQuery.from(Order.class);
    
        criteriaQuery.where(
                criteriaBuilder.exists(
                        orderSubQuery.where(
                                criteriaBuilder.equal(customer.get("id"), order.get("customerId")),
                                order.get("productId").in(new ExpressionBuilder()
                                        .literal("id")
                                        .sql("SELECT ? FROM products ORDER BY rating LIMIT ?",
                                                Collections.singletonList(3)
                                        )
                                )
                        )
                )
        );
    
        return em.createQuery(criteriaQuery).getResultList();
    }
}
```

Voilà! Warto pamiętać, że metoda `sql`, jako pierwsze podstawienie wybierze wyrażenie już obecne w builderze,
tak jak to widać w przykładzie. Jest to szczególnie pomocne, gdy chcemy dodać natywną część zapytania na samym jego końcu.

Podając w ramach parametrów obiekty typu *Path,* również nie uzyskamy oczekiwanego rezultatu, gdyż zostanie na nich wywołana
metoda `toString()` zamiast spodziewanego podstawienia nazwy kolumny atrybutu.
Ostatecznie znajomość takiego rozwiązania może się przydać szczególnie przy implementacji wsparcia dla złożonych warunków API.