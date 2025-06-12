---
title: Orden de evaluación de predicados SQL
url: sql-predicates-evaluation-order
id: 98
category:
  - databases: Bases de datos
tags:
  - sql
  - oracle
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

Al construir una consulta SQL, el orden de los predicados normalmente no determina el orden en que se evalúan.
Esto se debe en gran parte a la naturaleza declarativa del lenguaje. A diferencia de los lenguajes imperativos (PL/SQL, Java, C),
nos centramos en el qué, no en el cómo.

La elección real del plan de ejecución de la consulta depende de la implementación específica (algoritmo del optimizador).
Este proceso suele basarse en la distribución de datos dentro de las estructuras declaradas.
A menudo puedes olvidar la naturaleza declarativa de SQL, pero es importante recordarlo, sobre todo si lo imperativo es tu segunda naturaleza.

Un error común es esperar una evaluación short-circuit combinada con una función que puede lanzar error si la entrada es inválida (según el orden).
Normalmente, la evaluación short-circuit permite saltar el procesamiento si no afecta el resultado.

## Evaluación short-circuit

Con un ejemplo de impresión de si un valor de texto indica años anteriores al actual, podemos demostrar la evaluación short-circuit:

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
        System.out.printf("'%s' es un año pasado: %s%n", text, isPastYear(text));
    }

    private static boolean isPastYear(String text) {
        return text != null
                && text.matches("\\d{4}")
                && Year.from(YEAR_PATTERN.parse(text)).isBefore(Year.now());
    }

    /*
     * 'null' es un año pasado: false // text != null)
     * 'invalid' es un año pasado: false // text.matches("\\d{4}")
     * '2050' es un año pasado: false // isBefore
     * '1990' es un año pasado: true // isBefore
     * Exception in thread "main" java.time.format.DateTimeParseException: Text '0000' could not be parsed:
     *      Invalid value for YearOfEra (valid values 1 - 999999999/1000000000): 0
     *      // isBefore
     */
}
```

El comentario anterior muestra el resultado de la ejecución. En los dos primeros casos, no se evalúa el último predicado (de lo contrario, se lanzaría un error).

### Orden de predicados en SQL

Podemos construir criterios similares en Oracle, por ejemplo:
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
SELECT text as "Es un año pasado", 1
FROM messages
WHERE TO_DATE(text, 'YYYY') < SYSDATE
  AND REGEXP_LIKE(text, '^[[:digit:]]{4}$');

SELECT *
FROM TABLE (DBMS_XPLAN.DISPLAY);
```

El resultado del optimizador es un plan donde el orden de los predicados ha sido intercambiado. Bastante inteligente: de lo contrario, obtendríamos un error.

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
  <th>Es un año pasado</th>
</tr>
<tr>
  <td>1990</td>
</tr>
</table>
</center>

Ahora, complicando un poco el predicado, podemos provocar un error de conversión bajo la (incorrecta) suposición de imperatividad.

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
-- 0 filas recuperadas en 101 ms (ejecución: 8 ms, fetch: 93 ms)
SELECT text as "ORA-01841"
FROM messages
WHERE SUBSTR(text, 1, 4) = to_char(TO_DATE('2022', 'YYYY'), 'YYYY')
  AND TO_DATE(text, 'YYYY') < TO_DATE('2022', 'YYYY')
-- ORA-01841
```

Al encontrar un error así en una consulta compleja, conviene verificar si no has hecho suposiciones incorrectas sobre el orden.
En Oracle DB, los errores de conversión comunes incluyen:
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

Estos errores pueden ser especialmente sorprendentes si solo ocurren al invocar consultas desde la aplicación.
A menudo se debe a diferencias en los planes de consulta (diferente número de variables bind o ausencia de ellas).

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: (full) year must be between -4713 and +9999, and not be 0" title="ORA-01841: (full) year must be between -4713 and +9999, and not be 0">

Por la posición del error puedes encontrar rápidamente en qué paso ocurrió durante la ejecución del plan.
Para ver el plan, revisa las vistas de sistema `V$SQL` (SQL_TEXT) y `V$SQL_PLAN` (SQL_ID).
También puedes invocar el procedimiento `DBMS_XPLAN.DISPLAY_CURSOR` pasando el SQL ID y obtener el plan como tabla (como en el ejemplo).

## Forzando el orden de evaluación

La expresión `CASE` o la función `DECODE` (pero no `NVL` en Oracle DB) suelen ayudar a resolver el problema anterior.
Eso sí, revisa la documentación para confirmar que la evaluación short-circuit funciona igual en tu base de datos.

```sql
SELECT text as "Es un año pasado"
FROM messages
WHERE DECODE(SUBSTR(text, 1, 4), to_char(TO_DATE('1990', 'YYYY'), 'YYYY'), TO_DATE(text, 'YYYY'), null)
          < TO_DATE('2022', 'YYYY');

SELECT text as "Es un año pasado"
FROM messages
WHERE CASE
          WHEN SUBSTR(text, 1, 4) = to_char(TO_DATE('1990', 'YYYY'), 'YYYY') THEN TO_DATE(text, 'YYYY')
          END
          < TO_DATE('2022', 'YYYY');
```

Otra opción –procedimental– es usar una función personalizada:
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

SELECT text as "Es un año pasado"
FROM messages
WHERE to_date_nullable(text, 'YYYY') < TO_DATE('2022', 'YYYY');
```

Sin embargo, si te importa cada milisegundo de rendimiento, es mejor evitar estos workarounds.
En su lugar, usa estructuras y tipos de datos apropiados para tus consultas.
Deja la elección del orden de evaluación al optimizador.
