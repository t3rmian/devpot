---
title: JPA (EclipseLink) window functions
url: jpa-eclipselink-window-functions
id: 63
category:
- jpa: JPA
tags:
  - sql
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

Database window functions are a group of analytical functions that allow you to create detailed reports
presenting information about certain trends. An example of such a function can be the sum of a given group:
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```

While JPA is not an ideal tool for this purpose, we may nevertheless have a need of using
this feature in an existing application framework based on this technology.
Whereas the JPA specification itself does not provide such methods, forcing us to fall back to the native queries,
its individual implementations give us some powerful extensions.

How to build such a query with a window function using EclipseLink?
To explain this, I will use a sample from [the MySQL database documentation](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html).
Let's start with a simple table and fill it with the data:

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

Next, we will map the table to a JPA entity:

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

And now we can start implementing our function.
EclipseLink allows you to define your own operators and functions by registering them under a selected integer in the *ExpressionOperator* class.
When adding your own function, it is worth declaring the used numbers in one place:

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

Next, by creating an instance of the ExpressionOperator object, we define the arguments of our function and the target class.
For the target class, we can choose one of the options already defined by EclipseLink in the *ClassConstants* class.
The standard choice is *FunctionExpression*, but we can also use *ArgumentListFunctionExpression*
if our function has a dynamic number of arguments (e.g. an already defined *COALESCE* function):

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

It is fine if we add our function once, e.g. when the class is loaded, in a static block.
However, if we need separate implementations for separate databases, the setup will look different.

In such a case, you should find the EclipseLink class inheriting from *DatabasePlatform*,
which implements the functions of the database you are targeting. Then by extending this class,
add your own operator in the overridden *initializePlatformOperators()*
method and select the newly defined platform in the *persistence.xml* file:

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

Finally, we can use our new function through the JPA EclipseLink extensions.
Starting from the JPA *CriteriaBuilder* interface, cast it to the EclipseLink *JpaCriteriaBuilder* interface.
Then use it to create arguments for the new function and replace it with a JPA-compatible interface.
The function itself can be created using the *ExpressionBuilder* class by referencing the previously registered integer:

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

In the end, the results should be the same as in the example from the MySQL documentation:

<img src="/img/hq/jpa-window-functions.png" alt="Screenshot showing the result of the window function" title="EclipseLink – the result of a window function">

In the case of the JPQL, the solution is just as simple thanks to the `SQL` operator:
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

The `SQL` operator is also available as a method in the EclipseLink *Expression* class. You can use it without the need of registering
the function as well (similar to a simpler [`FUNC`/`FUNCTION` operator](https://www.eclipse.org/eclipselink/documentation/3.0/jpa/extensions/jpql.htm#CIHCCHIC)).
Lastly, check out the `OPERATOR` syntax to use functions registered under the specific name through the `ExpressionOperator.registerOperator(int selector, String name)`.