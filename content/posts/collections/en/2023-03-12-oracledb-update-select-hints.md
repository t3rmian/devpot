---
title: Applying hints to OracleDB subqueries
url: oracledb-hinty-zapytania-update
id: 106
category:
  - databases: Databases
tags:
  - sql
  - oracle
  - performance
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

Verifying the cost of joining tables using different algorithms can give you a better insight into your query performance.
You can force the OracleDB optimizer to choose a specific algorithm like Nested Loops or Hash Join using query hints `/*+ ... */ `.
Some [top results](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm) from Google search
explain only the basic usage of such hints without considering the subqueries.

<img src="/img/hq/explain-sql-plan-intellij.png" alt='Screenshot of the IntelliJ&#39;s "Explain Plan" quick action for a SQL query' title='IntelliJ&#39;s inbuilt "Explain Plan" action for a SQL query'>

## Forcing a desired table join with a subquery

On the example of an `UPDATE` operation, let's see how the use of hints with subqueries may not be too obvious.
For the demonstration, I will use a table created from the `ALL_OBJECTS` system view.

You can generate a query plan explanation by preceding the query with the `EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...`  clause.
After executing it, the plan is available for reading using the `DBMS_XPLAN.DISPLAY` procedure.
Just provide your plan ID and an optional format.

```sql
CREATE TABLE BIG_TABLE AS
SELECT ROWNUM AS ID, OBJECT_ID, OWNER, OBJECT_NAME,
       SUBOBJECT_NAME, OBJECT_TYPE, STATUS
FROM ALL_OBJECTS;
CREATE TABLE BIG_TABLE_2 AS SELECT * FROM BIG_TABLE;

EXPLAIN PLAN SET STATEMENT_ID = 'MY_UNRESOLVABLE_UPDATE' FOR
UPDATE /*+ LEADING(BT, BT2) USE_NL(BT2) */ BIG_TABLE BT
SET STATUS = 'INVALID'
WHERE OWNER = 'SYSTEM'
  AND EXISTS(SELECT 1
             FROM BIG_TABLE_2 BT2
             WHERE BT.OBJECT_ID = BT2.OBJECT_ID
               AND BT2.OWNER = 'SYSTEM');

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_UNRESOLVABLE_UPDATE',
    FORMAT=>'ALL +HINT_REPORT'));
```
From the query above, you should get (depending on your DB instance) an example plan with a *hash join*
instead of *nested loops* that we try to enforce with hints `LEADING` and `USE_NL`.

```sql
-------------------------------------------------------------------------------------------
| Id  | Operation                   | Name        | Rows  | Bytes | Cost (%CPU)| Time     |
-------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |             |     3 |   111 |   235   (1)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE   |       |       |            |          |
|*  2 |   HASH JOIN SEMI            |             |     3 |   111 |   235   (1)| 00:00:01 |
|*  3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE   |     3 |    66 |   117   (0)| 00:00:01 |
|*  4 |    TABLE ACCESS STORAGE FULL| BIG_TABLE_2 |     3 |    45 |   117   (0)| 00:00:01 |
-------------------------------------------------------------------------------------------

```
Further reading gives us more insight. 
The alias from the hint that refers to the table from the subquery is marked as **unresolved**:
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

Moving the hints into the subquery only makes the problem worse. This time both are marked as **unused**.
At this step, the optimizer is unable to use the provided hints.
Surprisingly or not, the right solution here is to move the `USE_NL` hint to the subquery:

```sql
EXPLAIN PLAN SET STATEMENT_ID = 'MY_RESOLVABLE_UPDATE' FOR
UPDATE /*+ LEADING(BT, BT2) */ BIG_TABLE BT
SET STATUS = 'INVALID'
WHERE OWNER = 'SYSTEM'
  AND EXISTS(SELECT /*+ USE_NL(BT2) */ 1
             FROM BIG_TABLE_2 BT2
             WHERE BT.OBJECT_ID = BT2.OBJECT_ID AND BT2.OWNER = 'SYSTEM');

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_RESOLVABLE_UPDATE',
    FORMAT=>'ALL +HINT_REPORT'));

    
-------------------------------------------------------------------------------------------
| Id  | Operation                   | Name        | Rows  | Bytes | Cost (%CPU)| Time     |
-------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |             |     3 |   111 |   467   (1)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE   |       |       |            |          |
|   2 |   NESTED LOOPS SEMI         |             |     3 |   111 |   467   (1)| 00:00:01 |
|*  3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE   |     3 |    66 |   117   (0)| 00:00:01 |
|*  4 |    TABLE ACCESS STORAGE FULL| BIG_TABLE_2 |     3 |    45 |   117   (1)| 00:00:01 |
-------------------------------------------------------------------------------------------

Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2
---------------------------------------------------------------------------

   1 -  SEL$3FF8579E
           -  LEADING(BT, BT2)

   4 -  SEL$3FF8579E / BT2@SEL$1
           -  USE_NL(BT2)
```

## UPDATE on a subquery

You can also update the direct result of a query and get rid of deeply nested subqueries.
However, the condition is that the query returns exactly one row for each updated record.
Otherwise, you will inevitably get the `ORA-01779` error:
> ORA-01779: cannot modify a column which maps to a non key-preserved table
```sql
CREATE UNIQUE INDEX U_BT2_OBJECT_ID ON BIG_TABLE_2 (OBJECT_ID);

EXPLAIN PLAN SET STATEMENT_ID = 'MY_UPDATE_ON_SUB_QUERY' FOR
UPDATE (SELECT /*+ LEADING(BT, BT2) USE_NL(BT2) */ BT.*
        FROM BIG_TABLE BT
        JOIN BIG_TABLE_2 BT2 ON BT.OBJECT_ID = BT2.OBJECT_ID)
SET STATUS = 'INVALID';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', 'MY_UPDATE_ON_SUB_QUERY',
    FORMAT=>'ALL +HINT_REPORT'));

---------------------------------------------------------------------------------------------
| Id  | Operation                   | Name            | Rows | Bytes | Cost (%CPU)| Time    |
---------------------------------------------------------------------------------------------
|   0 | UPDATE STATEMENT            |                 | 3529 |   58K|   119   (2)| 00:00:01 |
|   1 |  UPDATE                     | BIG_TABLE       |      |      |            |          |
|   2 |   NESTED LOOPS              |                 | 3529 |   58K|   119   (2)| 00:00:01 |
|   3 |    TABLE ACCESS STORAGE FULL| BIG_TABLE       | 3529 |   41K|   117   (0)| 00:00:01 |
|*  4 |    INDEX UNIQUE SCAN        | U_BT2_OBJECT_ID |    1 |     5|     0   (0)| 00:00:01 |
---------------------------------------------------------------------------------------------

Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2
---------------------------------------------------------------------------
 
   1 -  SEL$D4938F8A
           -  LEADING(BT, BT2)
 
   4 -  SEL$D4938F8A / BT2@SEL$1
           -  USE_NL(BT2)
```

Adding a unique index on the join fulfills the requirement.
Furthermore, we achieve quite [optimal](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
conditions for the optimizer to choose the **nested loops** by itself.

## Summary

For more information on influencing the optimizer, see the latest version of the [OracleDB 21 documentation](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA).
Unfortunately, for some reason, the newest documentation is poorly indexed by Google. For some shorter but still informative articles, take a look at:
- [Oracle 10g Full Hinting](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/);
- [Oracle 19c Hint Usage reporting](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0).