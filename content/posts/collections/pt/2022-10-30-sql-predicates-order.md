---
title: Ordem de avaliação dos predicados SQL
url: sql-ordem-avaliacao-predicados
id: 98
category:
- databases: Bancos de Dados
tags:
- sql
- oracle
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

Ao construir uma consulta SQL, a ordem dos predicados geralmente não determina a ordem em que são avaliados.
Isso se deve em grande parte à natureza declarativa da linguagem. Ao contrário das linguagens imperativas (PL/SQL, Java, C),
focamos no que queremos alcançar, não em como.

A escolha real do plano de execução da consulta fica a cargo da implementação específica (algoritmo otimizador).
Tal processo é frequentemente baseado na distribuição dos dados dentro das estruturas de dados declaradas.
Muitas vezes você pode não estar ciente ou esquecer da natureza declarativa do SQL. No entanto, vale a pena saber sobre isso, ainda mais quando a abordagem imperativa é sua segunda natureza.

Uma armadilha ocasional vem da expectativa de uma avaliação de curto-circuito em combinação com uma função que pode resultar em erro sob uma entrada inválida (ordem).
Normalmente, a avaliação de curto-circuito permite pular o processamento adicional se ele não afetar o resultado.

## Avaliação de curto-circuito

Através de um exemplo de uma impressão de se um valor de texto indica anos anteriores ao ano atual, podemos demonstrar a avaliação de curto-circuito:

```java
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;

class Scratch {
    private static final DateTimeFormatter YEAR_PATTERN = DateTimeFormatter.ofPattern("yyyy");

    public static void main(String[] args) {
        Arrays.asList(null, "invalid", "2050", "1990", "0000")
                .forEach(Scratch::printWhetherPastYear);
    }

    private static void printWhetherPastYear(String text) {
        System.out.printf("'%s' is a past year: %s%n", text, isPastYear(text));
    }

    private static boolean isPastYear(String text) {
        return text != null
                && text.matches("\\d{4}")
                && Year.from(YEAR_PATTERN.parse(text)).isBefore(Year.now());
    }

    /*
     * 'null' is a past year: false // text != null)
     * 'invalid' is a past year: false // text.matches("\\d{4}")
     * '2050' is a past year: false // isBefore
     * '1990' is a past year: true // isBefore
     * Exception in thread "main" java.time.format.DateTimeParseException: Text '0000' could not be parsed:
     *      Invalid value for YearOfEra (valid values 1 - 999999999/1000000000): 0
     *      // isBefore
     */
}
```

O comentário acima mostra o resultado da execução. Nos dois primeiros casos, não há avaliação do último predicado (caso contrário, um erro seria lançado).

### Ordem dos predicados SQL

Podemos construir critérios semelhantes em um banco de dados Oracle, por exemplo:
```sql
CREATE TABLE messages
(
    text VARCHAR(255)
);

INSERT ALL
    INTO messages (text) VALUES (null)
    INTO messages (text) VALUES ('invalid')
    INTO messages (text) VALUES ('1990')
    INTO messages (text) VALUES ('2050')
--     INTO messages (text, type) VALUES ('0000', 'year')
SELECT * FROM dual;

EXPLAIN PLAN FOR
SELECT text as "Is a past year", 1
FROM messages
WHERE TO_DATE(text, 'YYYY') < SYSDATE
  AND REGEXP_LIKE(text, '^[[:digit:]]{4}$');

SELECT *
FROM TABLE (DBMS_XPLAN.DISPLAY);
```

O resultado do otimizador é um plano no qual a ordem dos predicados foi trocada. Bastante inteligente – caso contrário, obteríamos um erro.

```sql
Plan hash value: 2071386872
 
------------------------------------------------------------------------------
| Id  | Operation         | Name     | Rows  | Bytes | Cost (%CPU)| Time     |
------------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |          |     1 |   129 |     3   (0)| 00:00:01 |
|*  1 |  TABLE ACCESS FULL| MESSAGES |     1 |   129 |     3   (0)| 00:00:01 |
------------------------------------------------------------------------------
 
Predicate Information (identified by operation id):
---------------------------------------------------
 
"   1 - filter( REGEXP_LIKE (""TEXT"",'^[[:digit:]]{4}$') AND "
"              TO_DATE(""TEXT"",'YYYY')<SYSDATE@!)"
 
Note
-----
   - dynamic statistics used: dynamic sampling (level=2)
```

<center>
<table>
<tr>
  <th>É um ano passado</th>
</tr>
<tr>
  <td>1990</td>
</tr>
</table>
</center>

Agora, complicando um pouco o predicado, podemos transformar isso em um erro de conversão sob a suposição (incorreta) de imperatividade da linguagem.

```sql
EXPLAIN PLAN FOR
SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
  AND TO_DATE(text, 'YYYY') < TO_DATE('2022', 'YYYY');

SELECT *
FROM TABLE (DBMS_XPLAN.DISPLAY);

-- Predicate Information (identified by operation id):
-- ---------------------------------------------------
--  
-- "   1 - filter(TO_DATE(""TEXT"",'YYYY')<TO_DATE('2022','YYYY') AND "
-- "              SUBSTR(""TEXT"",1,4)=TO_CHAR(TO_DATE('2022','YYYY'),'YYYY'))"

SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
-- 0 rows retrieved in 101 ms (execution: 8 ms, fetching: 93 ms)
SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
  AND TO_DATE(text, 'YYYY') < TO_DATE('2022', 'YYYY')
-- ORA-01841
```

Ao encontrar tal erro em uma consulta complexa, vale a pena verificar se você não fez suposições incorretas sobre a ordem.
No Oracle DB, erros comuns de conversão incluem os seguintes códigos:
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

Esses erros podem ser particularmente surpreendentes se ocorrerem apenas ao invocar consultas da aplicação.
Na maioria das vezes, isso se deve a diferenças nos planos de consulta (um número diferente de variáveis de bind ou falta delas).

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: ano (completo) deve estar entre -4713 e +9999, e não ser 0" title="ORA-01841: ano (completo) deve estar entre -4713 e +9999, e não ser 0">

Através da posição apontada pelo erro, você pode encontrar rapidamente em que etapa ele ocorreu durante a execução do plano de consulta.
Para consultar o plano, verifique as visões de sistema `V$SQL` (SQL_TEXT) e `V$SQL_PLAN` (SQL_ID).
Você também pode invocar o procedimento `DBMS_XPLAN.DISPLAY_CURSOR` fornecendo o SQL ID e recuperando o plano como uma tabela (como no exemplo).

## Forçando a ordem de avaliação

A expressão `CASE` ou a função `DECODE` (mas não `NVL` no Oracle DB) geralmente ajuda a resolver o problema acima.
No entanto, verifique novamente com a documentação se a avaliação de curto-circuito também funciona da mesma forma em seu banco de dados.

```sql
SELECT text as "Is a past year"
FROM messages
WHERE DECODE(SUBSTR(text, 1, 4), to_char(TO_DATE('1990', 'YYYY'), 'YYYY'), TO_DATE(text, 'YYYY'), null)
          < TO_DATE('2022', 'YYYY');

SELECT text as "Is a past year"
FROM messages
WHERE CASE
          WHEN SUBSTR(text, 1, 4) = to_char(TO_DATE('1990', 'YYYY'), 'YYYY') THEN TO_DATE(text, 'YYYY')
          END
          < TO_DATE('2022', 'YYYY');
```

Outra opção – procedural – é usar uma função personalizada:
```sql

CREATE OR REPLACE FUNCTION to_date_nullable(p_text IN VARCHAR2,
                                            p_format IN VARCHAR2)
    RETURN DATE
    IS
BEGIN
RETURN TO_DATE(p_text, p_format);
EXCEPTION
    WHEN OTHERS
        THEN
            RETURN NULL;
END;

SELECT text as "Is a past year"
FROM messages
WHERE to_date_nullable(text, 'YYYY') < TO_DATE('2022', 'YYYY');
```

No entanto, se você se preocupa com cada bit de desempenho, seria melhor evitar essas soluções alternativas.
Em vez disso, considere usar estruturas e tipos de dados apropriados para suas consultas.
Deixe a escolha da ordem de avaliação para o otimizador.
