---
title: OracleDB i wskazówki optymalizatora dla podzapytań
url: oracledb-hinty-zapytania-update
id: 106
category:
  - databases: Bazy danych
tags:
  - sql
  - oracle
  - wydajność
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

W przypadku optymalizacji zapytań SQL przydatna okazuje się możliwość weryfikacji kosztu łączenia tabel przy użyciu różnych algorytmów.
Za pomocą hintów `/*+ ... */` OracleDB możesz wymusić na optymalizatorze wybór takiego algorytmu (np. *Nested Loops* czy *Hash Join*).
Pierwszy obecnie [wynik](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm) w wyszukiwarce Google
przedstawiający użycie hintów pokazuje jednak jedynie proste przypadki bez sterowania podzapytań.

<img src="/img/hq/explain-sql-plan-intellij.png" alt='Zrzut ekranu przedstawiający szybką akcję "Explain Plan" dla zapytania SQL w IntelliJ"' title='Wbudowana akcja "Explain Plan" dla zapytania SQL w IntelliJ'>

## Wymuszenie oczekiwanego łączenia z podzapytaniem

Na przykładzie operacji `UPDATE` zobaczmy jak użycie hintów z podzapytaniami może okazać się niezbyt oczywiste.
Do demonstracji użyję tabeli zbudowanej z danych pochodzących z widoku systemowego `ALL_OBJECTS`.

Weryfikacja planu polega na poprzedzeniu zapytania klauzulą `EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...`.
Po jej wywołaniu plan dostępny jest do odczytu przy wykorzystaniu procedury `DBMS_XPLAN.DISPLAY`. Do niej podajemy
identyfikator wygenerowanego planu i opcjonalnie oczekiwany format.

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

Z powyższego zapytania otrzymujemy przykładowy plan z operacją *hash join* zamiast łączenia
przy użyciu *nested loops*, które próbujemy wymusić hintami `LEADING` i `USE_NL`.

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

Alias z hintu odnoszącego się do tabeli z podzapytania oznaczany jest jako *unresolved* tj. nieosiągalny:
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

Przenosząc hinty do podzapytania, pogarszamy jedynie problem. Tym razem oba raportowane są jako niewykorzystane (*unused*).
Na tym poziomie optymalizator nie jest już w stanie skorzystać z podanych wskazówek.
Właściwym rozwiązaniem jest tu natomiast przeniesienie hintu `USE_NL` do podzapytania:

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

## UPDATE na podzapytaniu

Operację możemy przeprowadzić również na bezpośrednim rezultacie zapytania i w takim wypadku pozbyć się głęboko zagnieżdżonych podzapytań.
Warunkiem jest jednak to, aby zapytanie zwracało dokładnie jeden wiersz dla każdego akutalizowanego rekordu.
W przeciwnym razie otrzymamy błąd `ORA-01779`:
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

Dodając unikalny indeks na łączeniu, osiągamy tym samym dosyć [optymalne](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
warunki, aby sam optymalizator wybrał łączenie przy użyciu *nested loops*.

## Podsumowanie

Więcej informracji o wpływie na optymalizator znajdziesz w najnowszej wersji [dokumentacji OracleDB 21](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA)
(niestety z jakichś powodów słabo indeksowaną przez Google). Polecam również krótsze do poczytania, a dające dużo informacji o:
- przykładowym wymuszaniu łączeń kilku tabel – [Oracle 10g Full Hinting](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/); 
- analizowaniu wykorzystania hintów – [Oracle 19c Hint Usage reporting](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0). 