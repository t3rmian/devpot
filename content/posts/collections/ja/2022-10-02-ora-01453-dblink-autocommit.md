---
title: dblink接続リソースの解放
url: dblink-ora-01453-autocommit
id: 96
category:
- databases: データベース
tags:
- oracle
- jdbc
- dblink
author: Damian Terlecki
date: 2022-10-02T20:00:00
---

OracleDBのDBlinkは、別のデータベースインスタンスへの接続を確立できる機能です。

```sql
create public database link remote
    connect to MY_USER identified by MY_PASSWORD
    using '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(service_name=ORCLPDB1)))';

select * from dual@remote;
```

このような接続の興味深い特徴は、dblinkテーブルに対して単純なSELECTクエリを実行しただけで、暗黙的にundoセグメントにトランザクションロックがかかることです。
この機能は、バージョン11.2の[管理者ガイド](https://docs.oracle.com/cd/E18283_01/server.112/e17120/ds_appdev002.htm)に記載されています。
アプリケーションの観点から見ると、これはリソース解放の点で特に興味深いです。dblinkアクセスがビューやプロシージャの下に隠されている場合はなおさらです。

<img src="/img/hq/ora-01453-dblink-autocommit.png" alt="DBLinkビュー" title="DBLinkビュー">

## コネクションプール

典型的なアプリケーションは、何らかのコネクションプールをよく使用します。
技術や抽象化のレベルに応じて、プールの使用方法は次のようになります。
- ユーザーからは隠蔽され、サーバー/コンテナによって完全に処理される（JPA/JTA）。
- ユーザーのリクエストに応じて行われ（DataSourceへの直接アクセス）、セッションで割り当てられたリソースを解放する責任はユーザーにある。

アプリケーションがそのような接続を必要としなくなったとき（トランザクションの宣言的な終了/接続クローズコマンド）、それはプールに戻ります。
その後、物理的に閉じられることなく再利用できます。

## JDBCとdblink

dblink機能のトランザクション的な性質には警戒が必要です。トランザクションロックを解除するには、コミットまたは
ロールバックが必要になります。これは、次のような状況では特に奇妙に思えるかもしれません。
- 自動コミットモードの接続でdblinkを使用すると、モードを変更しないとコミット/ロールバックを呼び出せない（特に非トランザクションJTAでは問題となる）。
> java.sql.SQLException: Could not rollback with auto-commit set on
> at oracle.jdbc.driver.PhysicalConnection.rollback(PhysicalConnection.java:2427)
- 読み取り専用モードの接続でdblinkを使用する場合、すなわち`SET TRANSACTION READ ONLY;` - トランザクションロックは関係なく発生します。

例えば、*dblink*によって割り当てられたリソースを解放せずに接続を解放すると、「新しい」接続でトランザクションレベルを変更しようとして失敗する可能性があります。
> java.sql.SQLException: ORA-01453: SET TRANSACTIONはトランザクションの最初の文でなければなりません
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:450)  
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:399)  
at oracle.jdbc.driver.T4C8Oall.processError(T4C8Oall.java:1059)  
at oracle.jdbc.driver.T4CTTIfun.receive(T4CTTIfun.java:522)  
at oracle.jdbc.driver.T4CTTIfun.doRPC(T4CTTIfun.java:257)  
at oracle.jdbc.driver.T4C8Oall.doOALL(T4C8Oall.java:587)  
at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:225)  
at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:53)  
at oracle.jdbc.driver.T4CPreparedStatement.executeForRows(T4CPreparedStatement.java:943)  
at oracle.jdbc.driver.OracleStatement.doExecuteWithTimeout(OracleStatement.java:1150)  
at oracle.jdbc.driver.OraclePreparedStatement.executeInternal(OraclePreparedStatement.java:4798)

	at oracle.jdbc.driver.OraclePreparedStatement.execute(OraclePreparedStatement.java:4901)  
	at oracle.jdbc.driver.OraclePreparedStatementWrapper.execute(OraclePreparedStatementWrapper.java:1385)

実際には、次のようになります。
```sql
-- app conn 1 (physical conn 1)
SET TRANSACTION READ ONLY;
select * from dual@remote;
-- app conn 1 closed (physical conn 1)
-- app conn 2 (physical conn 1)
SET TRANSACTION READ ONLY; -- error
```

## 検証/デバッグ

この問題があなたのアプリケーションに関連しているかを確認するには、データベース上のオープンなトランザクションを検証します。
以下のシステムビューに対するSELECT権限が必要になります。
```sql
GRANT SELECT ON V_$TRANSACTION to MY_USER; -- active transactions
GRANT SELECT ON V_$SESSION to MY_USER; -- sessions
GRANT SELECT ON V_$SQL to MY_USER; -- recent queries in the sessions
GRANT SELECT ON V_$PROCESS to MY_USER; -- session-process association
GRANT SELECT ON V_$DBLINK to MY_USER; -- dblink connections and transaction statuses, but only for the current session
```

権限を取得したら、クエリを実行します。

```sql
SELECT session_.SID
     , session_.SERIAL#
     , session_.USERNAME
     , session_.OSUSER
     , session_.PROGRAM
     , session_.EVENT
     , TO_CHAR(session_.LOGON_TIME,
               'YYYY-MM-DD HH24:MI:SS') as LOGON_TIME
     , TO_CHAR(transaction_.START_DATE,
               'YYYY-MM-DD HH24:MI:SS') as START_DATE
     , session_.LAST_CALL_ET
     , session_.BLOCKING_SESSION
     , session_.STATUS
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.PREV_SQL_ID
          AND ROWNUM <= 1)              AS PREV_SQL
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.SQL_ID
          AND ROWNUM <= 1)              AS CURRENT_SQL
FROM V$SESSION session_,
     V$TRANSACTION transaction_
WHERE session_.SADDR = transaction_.SES_ADDR;
```

上記のクエリでは、以下の列に注目してください。
- `LAST_CALL_ET`：セッションでの最後の活動からの秒数
- `START_DATE`：アプリケーション内の何らかのイベントに対応するトランザクションの開始日時
- `PREV_SQL`：セッション内の前のクエリ
- `CURRENT_SQL`：セッション内の現在のクエリ

通常、この情報で問題の原因を特定するには十分です。

## ログ

JDBCレベルで呼び出しをトレースすると、オープンなトランザクションを特定のプロセスに正確に関連付けるのに役立ちます。
[OJDBCのロギング設定](https://docs.oracle.com/database/121/JJDBC/diagnose.htm#JJDBC28885)をご覧ください。
要するに、ロギング用にビルドされたドライバ、つまりサフィックス`_g`が付いたものが必要になります。例えばMavenリポジトリから：

```xml
<dependency>
    <groupId>com.oracle.database.jdbc.debug</groupId>
    <artifactId>ojdbc8_g</artifactId>
    <version>21.7.0.0</version>
</dependency>
```

基本的な設定後、接続確立（ログオンイベント）と呼び出されたクエリに一致するログが表示されます。
```plaintext
2022-10-02 10:59:12.150  INFO 524 --- [main] oracle.jdbc: setCollectionUsageThreshold<PS Old Gen>(5136659251)
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Connection.logon: oracle.jdbc.driver.T4CConnection@66f659e6
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Operating System Process Identifier (SPID): 2411
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: DRCP Enabled: false
2022-10-02 10:59:13.029  INFO 524 --- [main] com.zaxxer.hikari.HikariDataSource: HikariPool-1 - Start completed.
2022-10-02 10:59:13.795  INFO 524 --- [main] oracle.jdbc: 30839E44 SQL: SET TRANSACTION READ ONLY
2022-10-02 10:59:13.900  INFO 524 --- [main] oracle.jdbc: 47E51549 SQL: SELECT * FROM orders@remote
```

さらに、最も詳細なロギングでは、クエリに関連付けられたSID/SERIAL#/TRACEFILEも見つかります。

```plaintext
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSerialNumber
FINEST: 191A709B Return: 42858
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSessionId
FINEST: 191A709B Return: 285
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.OracleSql getOriginalSql
FINEST: 360E9C06 Return: SELECT * FROM orders@remote
```

ベースにクエリを実行することで、セッションとプロセスの関連付けを取得できます。
```sql
SELECT *
FROM V$SESSION s
         JOIN V$PROCESS p on s.PADDR = p.ADDR
WHERE p.SPID = 2411;
```

残念ながら、このような低レベルのロギングは1秒あたり数10MBのログを生成する可能性があるため、
関連するパッケージにのみ設定するのが最善です。その後、共有スレッドログや相関IDによって特定の関数を特定できます。
あるいは、`DBMS_APPLICATION_INFO`パッケージを介してデータベースセッションに追跡情報を追加することもできます。

> `connection.setClientInfo("OCSID.MODULE", "My application");`  
> `connection.setClientInfo("OCSID.ACTION", "Generate a report");`

