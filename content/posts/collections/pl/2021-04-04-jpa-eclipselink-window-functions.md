---
title: Funkcje okienkowe przy użyciu JPA (EclipseLink)
url: jpa-eclipselink-funkcje-okienkowe
id: 63
tags:
  - java
  - bazy danych
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

Funkcje okienkowe w bazach danych to grupa funkcji analitycznych, pozwalająca tworzyć szczegółowe raporty
przedstawiające informacje o pewnych trendach. Przykładem takiej funkcji może być suma w danej grupie:
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```
Mimo że JPA nie jest idealnym narzędziem do tego celu, możemy jednak mieć potrzebę skorzystania z takiej funkcji w już istniejącym szkielecie
aplikacji opartym na tej technologii. O ile sama specyfikacja JPA nie udostępnia takich metod, to poszczególne jej implementacje, dają
nam szerokie pole do popisu.

Jak zbudować takie zapytanie z użyciem funkcji okienkowej przy użyciu EclipseLinka? Posłużymy się przykładem
z [dokumentacji bazy danych MySQL](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html).
Potrzebujemy do tego prostej tabelki z danymi:

```sql
CREATE TABLE sales (
    id NUMBER PRIMARY KEY,
    year NUMBER,
    country VARCHAR2(255),
    product VARCHAR2(255),
    profit NUMBER
);

INSERT ALL
    INTO sales VALUES(1, 2000, 'Finland', 'Computer', 1500)
    INTO sales VALUES(2, 2000, 'Finland', 'Phone', 100)
    INTO sales VALUES(3, 2001, 'Finland', 'Phone', 10)
    INTO sales VALUES(4, 2000, 'India', 'Calculator', 75)
    INTO sales VALUES(5, 2000, 'India', 'Calculator', 75)
    INTO sales VALUES(6, 2000, 'India', 'Computer', 1200)
    INTO sales VALUES(7, 2000, 'USA', 'Calculator', 75)
    INTO sales VALUES(8, 2000, 'USA', 'Computer', 1500)
    INTO sales VALUES(9, 2001, 'USA', 'Calculator', 50)
    INTO sales VALUES(10, 2001, 'USA', 'Computer', 1500)
    INTO sales VALUES(11, 2001, 'USA', 'Computer', 1200)
    INTO sales VALUES(12, 2001, 'USA', 'TV', 150)
    INTO sales VALUES(13, 2001, 'USA', 'TV', 100)
SELECT * FROM dual;
commit;
```

Odwzorowanie na encję JPA:

```java

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Table(name = "sales")
@Entity
public class Sales {

    @Id
    @Column(name = "year")
    private Integer year;

    @Column(name = "country")
    private String country;

    @Column(name = "product")
    private String product;

    @Column(name = "profit")
    private Long profit;

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public Long getProfit() {
        return profit;
    }

    public void setProfit(Long profit) {
        this.profit = profit;
    }

}
```

I możemy zacząć implementację naszej funkcji. EclipseLink pozwala na zdefiniowanie własnych operatorów i funkcji poprzez ich rejestrację
pod wybraną liczbą w klasie *ExpressionOperator*. Dodając własną funkcję, warto więc zadeklarować zajęte przez nas numery w jednym miejscu:

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

Następnie poprzez utworzenie instancji obiektu *ExpressionOperator* definiujemy argumenty naszej funkcji oraz klasę docelową.
W przypadku klasy docelowej możemy wybrać jedną z opcji zdefiniowanych już przez EclipseLinka w klasie ClassConstants.
Standardowym wyborem jest *FunctionExpression*, ale możemy też skorzystać z *ArgumentListFunctionExpression*, jeśli nasza funkcja
ma dynamiczną liczbę argumentów (np. już zdefiniowana funkcja *COALESCE*):

```java
import org.eclipse.persistence.expressions.ExpressionOperator;
import org.eclipse.persistence.internal.helper.ClassConstants;
import org.eclipse.persistence.internal.helper.NonSynchronizedVector;

public class MyDao {
    /*...*/
    static {
        ExpressionOperator sumOver = new ExpressionOperator();
        sumOver.setSelector(600);
        NonSynchronizedVector args = NonSynchronizedVector.newInstance();
        args.add("SUM(");
        args.add(") OVER(");
        args.add(")");
        sumOver.printsAs(args);
        sumOver.bePrefix();
        sumOver.setNodeClass(ClassConstants.FunctionExpression_Class);
        ExpressionOperator.addOperator(sumOver);
    }
}
```

Wystarczy, że naszą funkcję dodamy raz np. przy załadowaniu klasy w bloku statycznym. Jeśli jednak potrzebujemy oddzielnej implementacji
dla poszczególnych baz danych, to implementacja będzie nieco trudniejsza.

W takim przypadku powinniśmy odnaleźć klasę EclipseLinka
dziedziczącą z *DatabasePlatform*, która implementuje funkcje szukanej bazy danych i dodać nasz operarator w nadpisanej metodzie
*initializePlatformOperators()* oraz wybrać nowo zdefiniowaną platformę w pliku *persistence.xml*:

```xml
<persistence xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.2"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence http://xmlns.jcp.org/xml/ns/persistence/persistence_2_2.xsd">
    <persistence-unit name="my-persistence-unit">
        <properties>
            <property name="eclipselink.target-database" value="my.package.Class"/>
        </properties>
    </persistence-unit>
</persistence>
```

Ostatecznie z naszej nowej funkcji możemy skorzystać przy użyciu rozszerzeń JPA EclipseLinka.
Przy wykorzystaniu interfejsu JPA *CriteriaBuilder* wystarczy, że zrzutujemy go na EclipseLinkowy interfejs *JpaCriteriaBuilder*.
Następnie za jego pomocą tworzymy argumenty dla naszej nowej funkcji i zamieniamy ją z powrotem na interfejs kompatybilny ze standardem JPA.
Samą funkcję możemy stworzyć przy pomocy klasy *ExpressionBuilder*:

```java
import org.eclipse.persistence.expressions.ExpressionBuilder;
import org.eclipse.persistence.jpa.JpaCriteriaBuilder;

import javax.persistence.EntityManager;
import javax.persistence.Tuple;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.persistence.criteria.Expression;
import javax.persistence.criteria.Root;

public class MyDao {
    /*...*/
    public void runQuery() {
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = criteriaBuilder.createQuery(Tuple.class);
        Root<Sales> root = query.from(Sales.class);

        JpaCriteriaBuilder jpaCriteriaBuilder = (JpaCriteriaBuilder) criteriaBuilder;
        org.eclipse.persistence.expressions.Expression sumMoney = jpaCriteriaBuilder.toExpression(root.get("profit"));
        org.eclipse.persistence.expressions.Expression country = jpaCriteriaBuilder.toExpression(root.get("country"));
        ExpressionBuilder expressionBuilder = new ExpressionBuilder();
        org.eclipse.persistence.expressions.Expression sumMoneyOverCountry =
                expressionBuilder.getOperator(MyExpressionOperators.SUM_OVER)
                        .newExpressionForArgument(sumMoney, country);
        query.select(criteriaBuilder.tuple(
                root.get("year"),
                root.get("country"),
                root.get("product"),
                root.get("profit"),
                jpaCriteriaBuilder.fromExpression(sumMoneyOverCountry, Long.class)));
        entityManager.createQuery(query).getResultList();
    }
}
```

Finalnie powinniśmy otrzymać ten sam rezultat co w przykładzie z dokumentacji MySQL:

<img src="/img/hq/jpa-window-functions.png" alt="Zrzut ekranu przedstawiający rezultat funkcji okienkowej" title="EclipseLink – rezultat funkcji okienkowej">

W przypadku samego JPQL-a rozwiązanie jest równie proste dzięki operatorowi `SQL`:
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

Operator `SQL` jest również dostępny pod postacią metody w EclipseLinkowej klasie *Expression*. Możesz skorzystać z niego, jeśli chcesz
pominąć konieczność rejestracji funkcji.