---
title: SQL predicates evaluation order
url: sql-predicates-evaluation-order
id: 98
category:
  - databases: Databases
tags:
  - sql
  - oracle
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

When building an SQL query, the order of predicates usually does not determine the order in which they are evaluated.
It is largely due to the declarative nature of the language. Unlike imperative languages (PL/SQL, Java, C),
we focus on what we want to achieve, not how.

The actual choice of the query execution plan is up to the specific implementation (optimizer algorithm).
Such a process is often based on the data distribution within the declared data structures.
You may often be unaware or forget about the declarative nature of SQL. However, it is worth knowing about it, more so when the imperative approach is your second nature.

An occasional pitfall comes from expecting a short-circuit evaluation in combination with a function that can result in an error under an invalid input (order).
Usually, short-circuit evaluation allows you to skip further processing if it does not affect the outcome.

## Short-circuit evaluation

Through an example of a printout of whether a text value indicates previous years to the current year, we can demonstrate the short-circuit evaluation:

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

The above comment shows the result of the execution. In the first two cases, there is no evaluation of the last predicate (otherwise an error would be thrown).

### SQL predicates order

We can build similar criteria in an Oracle database, for example:
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

The result of the optimizer is a plan in which the order of predicates has been swapped. Quite clever – otherwise, we would get an error.

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

Now, by complicating the predicate a bit, we can turn this into a conversion error under the (incorrect) assumption of language imperativeness.

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

When encountering such an error in a complex query, it is worth verifying whether you haven't made incorrect assumptions about the order.
In Oracle DB, common conversion errors include the following codes:
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

These errors can be particularly surprising if they only occur when invoking queries from the application.
Most often, this is due to differences in query plans (a different number of bind variables or lack thereof).

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: (full) year must be between -4713 and +9999, and not be 0" title="ORA-01841: (full) year must be between -4713 and +9999, and not be 0">

Through the position pointed by the error, you can quickly find at which step it occurred during the query plan execution.
To look up the plan, check out the `V$SQL` (SQL_TEXT) and `V$SQL_PLAN` (SQL_ID) system views.
You can also invoke the `DBMS_XPLAN.DISPLAY_CURSOR` procedure by providing the SQL ID and retrieving the plan as a table (as in the example).

## Enforcing the order of evaluation

The `CASE` expression or `DECODE` function (but not `NVL` in Oracle DB) usually helps solve the above problem.
Do, however, double-check with the documentation whether the short-circuit evaluation also works the same way in your database.

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

Yet another – procedural – option is to use a custom function:
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

However, if you care about every bit of performance, you would be better off without these workarounds.
Instead, consider using appropriate structures and data types for your queries.
Leave the choice of evaluation order up to the optimizer.