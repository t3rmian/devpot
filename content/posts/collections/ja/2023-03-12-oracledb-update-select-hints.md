---
title: OracleDBのサブクエリにヒントを適用する
url: oracledb-サブクエリ-ヒント-update
id: 106
category:
- databases: データベース
tags:
- sql
- oracle
- パフォーマンス
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

異なるアルゴリズムを使ってテーブルを結合するコストを検証することで、クエリのパフォーマンスについてより深く理解することができます。
クエリヒント`/*+ ... */ `を使用して、OracleDBオプティマイザにNested LoopsやHash Joinなどの特定のアルゴリズムを選択させることができます。
Google検索の[トップ結果](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm)のいくつかは、
サブクエリを考慮せずに、そのようなヒントの基本的な使用法のみを説明しています。

<img src="/img/hq/explain-sql-plan-intellij.png" alt='SQLクエリに対するIntelliJの「Explain Plan」クイックアクションのスクリーンショット' title='SQLクエリに対するIntelliJの「Explain Plan」アクション'>

## サブクエリで目的のテーブル結合を強制する

`UPDATE`操作を例に、サブクエリでヒントを使用するのが、いかに直感的でないかを見てみましょう。
デモンストレーションには、`ALL_OBJECTS`システムビューから作成したテーブルを使用します。

クエリの前に`EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...`句を付けることで、クエリプランの説明を生成できます。
それを実行した後、プランは`DBMS_XPLAN.DISPLAY`プロシージャを使用して読み取ることができます。
プランIDとオプションのフォーマットを指定するだけです。

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
上記のクエリから、DBインスタンスによっては、ヒント`LEADING`と`USE_NL`で強制しようとしている*nested loops*の代わりに、
*hash join*を含むプランの例が得られるはずです。

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
さらに読み進めると、より深い洞察が得られます。
サブクエリのテーブルを参照するヒントのエイリアスは、**未解決（unresolved）**とマークされています。
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

ヒントをサブクエリに移動すると、問題は悪化するだけです。今回は両方とも**未使用（unused）**とマークされます。
この段階では、オプティマイザは提供されたヒントを使用できません。
驚くべきことに、正しい解決策は`USE_NL`ヒントをサブクエリに移動することです。

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

## サブクエリに対するUPDATE

クエリの直接の結果を更新し、深くネストされたサブクエリを取り除くこともできます。
ただし、条件は、クエリが更新される各レコードに対して正確に1行を返すことです。
そうでなければ、必然的に`ORA-01779`エラーが発生します。
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

結合に一意のインデックスを追加すると、要件が満たされます。
さらに、オプティマイザが**nested loops**を自ら選択するための、かなり[最適な](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
条件を達成します。

## まとめ

オプティマイザに影響を与える方法についての詳細は、最新バージョンの[OracleDB 21のドキュメント](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA)を参照してください。
残念ながら、何らかの理由で、最新のドキュメントはGoogleによってうまくインデックスされていません。より短く、それでも有益な記事については、以下をご覧ください。
- [Oracle 10g Full Hinting](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/);
- [Oracle 19c Hint Usage reporting](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0).
