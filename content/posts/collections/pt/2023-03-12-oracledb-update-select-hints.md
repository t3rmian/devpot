---
title: Aplicando hints a subconsultas no OracleDB
url: oracledb-hints-subconsultas-update
id: 106
category:
- databases: Bancos de Dados
tags:
- sql
- oracle
- desempenho
author: Damian Terlecki
date: 2023-03-12T20:00:00
---

Verificar o custo de unir tabelas usando diferentes algoritmos pode lhe dar uma melhor visão sobre o desempenho de sua consulta.
Você pode forçar o otimizador do OracleDB a escolher um algoritmo específico, como Nested Loops ou Hash Join, usando hints de consulta `/*+ ... */ `.
Alguns dos [principais resultados](https://docs.oracle.com/cd/B12037_01/server.101/b10752/hintsref.htm) da pesquisa do Google
explicam apenas o uso básico de tais hints, sem considerar as subconsultas.

<img src="/img/hq/explain-sql-plan-intellij.png" alt='Captura de tela da ação rápida "Explain Plan" do IntelliJ para uma consulta SQL' title='Ação "Explain Plan" nativa do IntelliJ para uma consulta SQL'>

## Forçando uma junção de tabela desejada com uma subconsulta

No exemplo de uma operação `UPDATE`, vamos ver como o uso de hints com subconsultas pode não ser tão óbvio.
Para a demonstração, usarei uma tabela criada a partir da visão de sistema `ALL_OBJECTS`.

Você pode gerar uma explicação do plano de consulta precedendo a consulta com a cláusula `EXPLAIN PLAN SET STATEMENT_ID = '<ID>' FOR ...`.
Após executá-la, o plano fica disponível para leitura usando o procedimento `DBMS_XPLAN.DISPLAY`.
Basta fornecer o ID do seu plano e um formato opcional.

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
Da consulta acima, você deve obter (dependendo da sua instância de BD) um plano de exemplo com um *hash join*
em vez de *nested loops* que tentamos forçar com os hints `LEADING` e `USE_NL`.

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
Uma leitura mais aprofundada nos dá mais informações.
O alias do hint que se refere à tabela da subconsulta é marcado como **não resolvido**:
```sql
Hint Report (identified by operation id / Query Block Name / Object Alias):
Total hints for statement: 2 (N - Unresolved (1))
---------------------------------------------------------------------------
 
   1 -  SEL$3FF8579E
         N -  USE_NL(BT2)
           -  LEADING(BT, BT2)
```

Mover os hints para a subconsulta apenas piora o problema. Desta vez, ambos são marcados como **não utilizados**.
Nesta etapa, o otimizador não consegue usar os hints fornecidos.
Surpreendentemente ou não, a solução correta aqui é mover o hint `USE_NL` para a subconsulta:

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

## UPDATE em uma subconsulta

Você também pode atualizar o resultado direto de uma consulta e se livrar de subconsultas profundamente aninhadas.
No entanto, a condição é que a consulta retorne exatamente uma linha para cada registro atualizado.
Caso contrário, você inevitavelmente receberá o erro `ORA-01779`:
> ORA-01779: não é possível modificar uma coluna que mapeia para uma tabela não preservada por chave
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

Adicionar um índice único na junção cumpre o requisito.
Além disso, alcançamos condições bastante [ótimas](https://logicalread.com/oracle-11g-when-nested-loop-joins-are-ideal-mc02/)
para que o otimizador escolha o **nested loops** por si só.

## Resumo

Para mais informações sobre como influenciar o otimizador, consulte a versão mais recente da [documentação do OracleDB 21](https://docs.oracle.com/en/database/oracle/oracle-database/21/tgsql/influencing-the-optimizer.html#GUID-1697E7CA-9DD0-4C0D-9BC9-E4E17334C0AA).
Infelizmente, por algum motivo, a documentação mais recente é mal indexada pelo Google. Para alguns artigos mais curtos, mas ainda informativos, dê uma olhada em:
- [Oracle 10g Full Hinting](https://jonathanlewis.wordpress.com/2007/01/16/full-hinting/);
- [Oracle 19c Hint Usage reporting](https://franckpachot.medium.com/oracle-19c-hint-usage-reporting-345563a461f0).
