---
title: Funções de janela no JPA (EclipseLink)
url: jpa-eclipselink-funcoes-de-janela
id: 63
category:
- jpa: JPA
tags:
  - sql
  - eclipselink
author: Damian Terlecki
date: 2021-04-04T20:00:00
---

As funções de janela do banco de dados são um grupo de funções analíticas que permitem criar relatórios detalhados apresentando informações sobre certas tendências. Um exemplo de tal função pode ser a soma de um determinado grupo:
```sql
SUM([ DISTINCT | ALL ] expr) [ OVER (analytic_clause) ] 
```

Embora o JPA não seja uma ferramenta ideal para este propósito, podemos, no entanto, ter a necessidade de usar este recurso em uma estrutura de aplicação existente baseada nesta tecnologia. Embora a própria especificação do JPA não forneça tais métodos, forçando-nos a recorrer a consultas nativas, suas implementações individuais nos dão algumas extensões poderosas.

Como construir tal consulta com uma função de janela usando o EclipseLink? Para explicar isso, usarei um exemplo da [documentação do banco de dados MySQL](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/window-functions-usage.html). Vamos começar com uma tabela simples e preenchê-la com os dados:

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

Em seguida, mapearemos a tabela para uma entidade JPA:

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

E agora podemos começar a implementar nossa função. O EclipseLink permite que você defina seus próprios operadores e funções, registrando-os sob um inteiro selecionado na classe *ExpressionOperator*. Ao adicionar sua própria função, vale a pena declarar os números usados em um só lugar:

```java
public interface MyExpressionOperators {
    int SUM_OVER = 600;
}
```

Em seguida, ao criar uma instância do objeto ExpressionOperator, definimos os argumentos da nossa função e a classe de destino. Para a classe de destino, podemos escolher uma das opções já definidas pelo EclipseLink na classe *ClassConstants*. A escolha padrão é *FunctionExpression*, mas também podemos usar *ArgumentListFunctionExpression* se nossa função tiver um número dinâmico de argumentos (por exemplo, uma função *COALESCE* já definida):

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

É bom se adicionarmos nossa função uma vez, por exemplo, quando a classe é carregada, em um bloco estático. No entanto, se precisarmos de implementações separadas para bancos de dados separados, a configuração será diferente.

Nesse caso, você deve encontrar a classe do EclipseLink que herda de *DatabasePlatform*, que implementa as funções do banco de dados que você está visando. Em seguida, estendendo essa classe, adicione seu próprio operador no método *initializePlatformOperators()* sobrescrito e selecione a plataforma recém-definida no arquivo *persistence.xml*:

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

Finalmente, podemos usar nossa nova função através das extensões do JPA EclipseLink. Começando pela interface JPA *CriteriaBuilder*, faça um cast para a interface EclipseLink *JpaCriteriaBuilder*. Em seguida, use-a para criar argumentos para a nova função e substitua-a por uma interface compatível com JPA. A função em si pode ser criada usando a classe *ExpressionBuilder*, referenciando o inteiro registrado anteriormente:

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

No final, os resultados devem ser os mesmos do exemplo da documentação do MySQL:

<img src="/img/hq/jpa-window-functions.png" alt="Captura de tela mostrando o resultado da função de janela" title="EclipseLink – o resultado de uma função de janela">

No caso do JPQL, a solução é igualmente simples graças ao operador `SQL`:
```sql
SELECT
    s.year, s.country, s.product, s.profit,
    SQL('SUM(?) OVER(PARTITION BY ?)', s.profit, s.country) AS country_profit
FROM sales s
```

O operador `SQL` também está disponível como um método na classe *Expression* do EclipseLink. Você pode usá-lo sem a necessidade de registrar a função (semelhante a um operador mais simples [`FUNC`/`FUNCTION`](https://www.eclipse.org/eclipselink/documentation/3.0/jpa/extensions/jpql.htm#CIHCCHIC)). Por fim, confira a sintaxe `OPERATOR` para usar funções registradas sob o nome específico através de `ExpressionOperator.registerOperator(int selector, String name)`.
