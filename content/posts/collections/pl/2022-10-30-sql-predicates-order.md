---
title: Kolejność predykatów zapytania SQL
url: kolejność-predykatów-zapytania-sql
id: 98
category:
  - databases: Bazy danych
tags:
  - sql
  - oracle
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

Podczas budowania zapytania SQL kolejność predykatów zwykle nie determinuje kolejności ich wywołania.
W dużej mierze wynika to z deklaratywnej charakterystyki języka. W odróżnieniu od języków imperatywnych (PL/SQL, Java, C),
możemy skupić się na tym, co chcemy osiągnąć, a nie jak.

To od konkretnej implementacji (optymalizatora) zależy wybór planu wykonania zapytania,
najczęściej na podstawie statystyk rozkładu danych w ramach zadeklarowanych struktur danych.
O deklaratywnej naturze SQL możemy często nie zdawać sobie sprawy. Warto jednak o niej wiedzieć, szczególnie jeśli jesteśmy przyzwyczajeni do podejścia imperatywnego.

Wartą uwagi pułapką jest połączenie imperatywnej funkcjonalności *short-circuit evaluation* wraz z funkcją, która może powodować zatrzymanie wykonania zapytania (błąd) przy nieodpowiedniej kolejności zastosowania.
*Short-circuit evaluation* pozwala bowiem na pominięcie sprawdzania kolejnych części predykatu, jeśli poprzednia jego część wystarcza do stwierdzenia wyniku.

## Short-circuit evaluation

Działanie funkcjonalności można zaprezentować na przykładzie próby wypisania czy wartość tekstowa wskazuje na lata poprzednie do obecnego roku:

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
Komentarz powyżej przedstawia wynik wykonania. W pierwszych dwóch przypadkach nie następuje ewaluacja ostatniego predykatu. 

### Kolejność predykatów w SQL

Podobne kryterium możemy odtworzyć przykładowo w bazie danych Oracle:
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

W wyniku działania optymalizatora otrzymamy plan, w którym kolejność predykatów została mądrze zamieniona:

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
  <th>Is a past year</th>
</tr>
<tr>
  <td>1990</td>
</tr>
</table>
</center>

Natomiast komplikując nieco predykat, możemy doprowadzić nawet do błędu konwersji przy (niepoprawnym) założeniu imperatywności języka.

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

Napotykając taki błąd w złożonym zapytaniu, warto zweryfikować czy nie przyjęliśmy złych założeń dotyczących imperatywności.
W Oracle DB typowe błędy konwersji obejmują m.in. następujące kody:
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

Błędy te mogą być szczególnie zaskakujące jeśli występują jedynie przy wywołaniu zapytań z poziomu aplikacji.
Najczęściej spowodowane jest to innym planem zapytania wynikającym z użycia bądź nie, zmiennych bindowanych.

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: (full) year must be between -4713 and +9999, and not be 0" title="ORA-01841: (full) year must be between -4713 and +9999, and not be 0">

Po numerze pozycji wskazywanym przez błąd, szybko odnajdziesz miejsce, w którym nastąpił błąd konwersji przy wykonywaniu planu zapytania.
Sam plan możesz podejrzeć, odpytując widoki systemowe `V$SQL` (SQL_TEXT) oraz `V$SQL_PLAN` (SQL_ID) bądź podając identyfikator SQL procedurze `DBMS_XPLAN.DISPLAY_CURSOR`.

## Wymuszanie kolejności ewaluacji

W rozwiązaniu powyższego problemu zazwyczaj pomaga wyrażenie CASE bądź funkcja DECODE (natomiast nie NVL w Oracle DB).
Właściwie to, czy *short-circuit evaluation* zadziała również dla Twojej bazy, zweryfikujesz w dokumentacji.
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

Jeszcze inną opcją jest użycie własnej funkcji proceduralnej:
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

Jeśli jednak zależy nam na optymalności rozwiązania, lepiej zrezygnować z powyższych podejść.
W zamian warto wziąć pod uwagę dobór odpowiednich struktur i typów danych na bazie.
Tak, aby wybór najlepszej kolejności ewaluacji oddać z powrotem w ręce optymalizatora.