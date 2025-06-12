---
title: Aplicando hints a subconsultas en OracleDB
url: oracledb-hinty-zapytania-update
id: 106
category:
  - databases: Bases de datos
tags:
  - sql
  - oracle
  - performance
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

Verificar el coste de unir tablas usando diferentes algoritmos puede darte una mejor visión del rendimiento de tus consultas.
Puedes forzar al optimizador de OracleDB a elegir un algoritmo específico como Nested Loops o Hash Join usando hints en la consulta `/*+ ... */`.
Algunos [resultados principales](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm) de Google explican solo el uso básico de estos hints sin considerar las subconsultas.

<img src="/img/hq/explain-sql-plan-intellij.png" alt='Captura de pantalla de la acción "Explain Plan" de IntelliJ para una consulta SQL' title='Acción "Explain Plan" integrada en IntelliJ para una consulta SQL'>

## Forzando un join deseado con subconsulta

Veamos con un ejemplo de operación `UPDATE` cómo el uso de hints con subconsultas puede no ser tan obvio.
Para la demo, usaré una tabla creada a partir de la vista de sistema `ALL_OBJECTS`.

Puedes generar la explicación del plan de consulta anteponiendo la consulta con `EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...`.
Tras ejecutarlo, el plan está disponible usando el procedimiento `DBMS_XPLAN.DISPLAY`.
Solo tienes que pasar el ID del plan y un formato opcional.

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
De la consulta anterior, deberías obtener (según tu instancia de BD) un plan de ejemplo con *hash join*
en vez de *nested loops* que intentamos forzar con los hints `LEADING` y `USE_NL`.

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

Leyendo más, vemos que el alias del hint que hace referencia a la tabla de la subconsulta aparece como **unresolved**:
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

Mover los hints a la subconsulta solo empeora el problema. Ahora ambos aparecen como **unused**.
En este punto, el optimizador no puede usar los hints dados.
Curiosamente, la solución correcta es mover el hint `USE_NL` a la subconsulta:

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

## UPDATE sobre una subconsulta

También puedes actualizar el resultado directo de una consulta y evitar subconsultas anidadas.
La condición es que la consulta devuelva exactamente una fila por cada registro actualizado.
Si no, obtendrás el error `ORA-01779`:
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

Añadir un índice único en el join cumple el requisito.
Además, conseguimos condiciones bastante [óptimas](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
para que el optimizador elija los **nested loops** por sí solo.

## Resumen

Para más información sobre cómo influir en el optimizador, consulta la última versión de la [documentación de OracleDB 21](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA).
Por alguna razón, la documentación más reciente está poco indexada en Google. Para artículos más cortos pero útiles, revisa:
- [Oracle 10g Full Hinting](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/);
- [Oracle 19c Hint Usage reporting](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0).
