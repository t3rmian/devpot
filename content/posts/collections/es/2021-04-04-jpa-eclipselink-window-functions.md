---
title: Funciones de ventana en JPA (EclipseLink)
url: jpa-eclipselink-window-functions
id: 63
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

Las funciones de ventana en bases de datos son un grupo de funciones analíticas que permiten crear informes detallados
mostrando información sobre ciertas tendencias. Un ejemplo de este tipo de función puede ser la suma de un grupo dado:
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```

Aunque JPA no es la herramienta ideal para este propósito, puede que necesitemos usar
esta característica en un framework de aplicación existente basado en esta tecnología.
La especificación de JPA en sí no proporciona tales métodos, obligándonos a recurrir a consultas nativas,
pero sus implementaciones concretas nos dan algunas extensiones potentes.

¿Cómo construir una consulta con función de ventana usando EclipseLink?
Para explicarlo, usaré un ejemplo de [la documentación de MySQL](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html).
Empecemos con una tabla sencilla y rellenémosla con datos:

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

Ahora mapeamos la tabla a una entidad JPA:

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

Ahora podemos empezar a implementar nuestra función.
EclipseLink permite definir operadores y funciones propias registrándolas bajo un entero seleccionado en la clase *ExpressionOperator*.
Al añadir una función propia, conviene declarar los números usados en un solo lugar:

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

Luego, creando una instancia de ExpressionOperator, definimos los argumentos de la función y la clase objetivo.
Para la clase objetivo, podemos elegir una de las opciones ya definidas por EclipseLink en la clase *ClassConstants*.
La opción estándar es *FunctionExpression*, pero también podemos usar *ArgumentListFunctionExpression*
si la función tiene un número dinámico de argumentos (por ejemplo, la función *COALESCE* ya definida):

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

Está bien si añadimos la función una vez, por ejemplo al cargar la clase, en un bloque estático.
Sin embargo, si necesitamos implementaciones separadas para distintas bases de datos, la configuración será diferente.

En ese caso, hay que buscar la clase de EclipseLink que herede de *DatabasePlatform*,
que implemente las funciones de la base de datos objetivo. Luego, extendiendo esa clase,
añade tu propio operador en el método sobreescrito *initializePlatformOperators()*
y selecciona la nueva plataforma en el archivo *persistence.xml*:

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

Por último, podemos usar la nueva función a través de las extensiones de JPA de EclipseLink.
Partiendo de la interfaz *CriteriaBuilder* de JPA, la casteamos a la interfaz *JpaCriteriaBuilder* de EclipseLink.
Luego la usamos para crear los argumentos de la nueva función y la reemplazamos por una interfaz compatible con JPA.
La función en sí puede crearse usando la clase *ExpressionBuilder* haciendo referencia al entero registrado previamente:

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

Al final, los resultados deberían ser los mismos que en el ejemplo de la documentación de MySQL:

<img src="/img/hq/jpa-window-functions.png" alt="Captura de pantalla mostrando el resultado de la función de ventana" title="EclipseLink – resultado de una función de ventana">

En el caso de JPQL, la solución es igual de sencilla gracias al operador `SQL`:
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

El operador `SQL` también está disponible como método en la clase *Expression* de EclipseLink. Puedes usarlo sin necesidad de registrar
la función (similar al operador [`FUNC`/`FUNCTION`](https://www.eclipse.org/eclipselink/documentation/3.0/jpa/extensions/jpql.htm#CIHCCHIC)).
Por último, revisa la sintaxis `OPERATOR` para usar funciones registradas bajo un nombre específico mediante `ExpressionOperator.registerOperator(int selector, String name)`.
