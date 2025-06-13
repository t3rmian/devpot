---
title: SQL述語の評価順序
url: sql-述語-評価順序
id: 98
category:
- databases: データベース
tags:
- sql
- oracle
author: Damian Terlecki
date: 2022-10-30T20:00:00
---

SQLクエリを構築する際、述語の順序は通常、それらが評価される順序を決定しません。
これは主に、この言語の宣言的な性質によるものです。命令型言語（PL/SQL, Java, C）とは異なり、
我々は「何を」達成したいかに焦点を当て、「どのように」かではありません。

クエリ実行計画の実際の選択は、特定の実装（オプティマイザのアルゴリズム）に委ねられています。
このようなプロセスは、しばしば宣言されたデータ構造内のデータ分布に基づいています。
SQLの宣言的な性質について、しばしば気づかなかったり忘れたりすることがあるかもしれません。しかし、特に命令的なアプローチが第二の天性である場合には、それについて知っておく価値があります。

時折、無効な入力（順序）でエラーになる可能性がある関数と組み合わせて、短絡評価を期待してしまうという落とし穴があります。
通常、短絡評価では、結果に影響を与えない場合はそれ以降の処理をスキップできます。

## 短絡評価

テキスト値が現在より前の年を示しているかどうかを出力する例を通して、短絡評価を実証できます。

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

上記のコメントは実行結果を示しています。最初の2つのケースでは、最後の述語の評価はありません（そうでなければエラーがスローされたでしょう）。

### SQL述語の順序

Oracleデータベースで同様の基準を構築できます。例えば：
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

オプティマイザの結果は、述語の順序が入れ替わった計画です。かなり賢いですね。そうでなければエラーになっていたでしょう。

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

さて、述語を少し複雑にすることで、言語の命令性を（誤って）前提とした場合に変換エラーに変えることができます。

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

複雑なクエリでこのようなエラーに遭遇した場合、順序について誤った仮定をしていないか検証する価値があります。
Oracle DBでは、一般的な変換エラーには以下のコードが含まれます：
- ORA-01722: invalid number;
- ORA-01858: a non-numeric character was found where a numeric was expected;
- ORA-01859: a non-alphabetic character was found where an alphabetic was expected;
- ORA-01861: literal does not match format string;
- ORA-01863: the year is not supported for the current calendar;
- ORA-01864: the date is out of range for the current calendar;
- ORA-01865: not a valid era;
- ORA-01884: divisor is equal to zero.

これらのエラーは、アプリケーションからクエリを呼び出したときにのみ発生する場合、特に驚くかもしれません。
これは、クエリプランの違い（バインド変数の数が異なる、または存在しない）が原因であることがほとんどです。

<img src="/img/hq/test-class-initialization-testsuite.png" alt="ORA-01841: (full) year must be between -4713 and +9999, and not be 0" title="ORA-01841: (full) year must be between -4713 and +9999, and not be 0">

エラーが指し示す位置から、クエリプランの実行中にどのステップでエラーが発生したかをすぐに見つけることができます。
プランを調べるには、`V$SQL`（SQL_TEXT）と`V$SQL_PLAN`（SQL_ID）システムビューを確認してください。
また、SQL IDを指定して`DBMS_XPLAN.DISPLAY_CURSOR`プロシージャを呼び出し、プランをテーブルとして取得することもできます（例のように）。

## 評価順序の強制

`CASE`式や`DECODE`関数（ただしOracle DBの`NVL`ではない）は、通常、上記の問題を解決するのに役立ちます。
ただし、お使いのデータベースで短絡評価が同じように機能するかどうかをドキュメントで再確認してください。

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

もう一つの手続き的な選択肢は、カスタム関数を使用することです。
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

しかし、パフォーマンスのわずかな違いでも気にするのであれば、これらの回避策なしで済ませる方が良いでしょう。
代わりに、クエリに適した構造とデータ型を使用することを検討してください。
評価順序の選択はオプティマイザに任せましょう。
