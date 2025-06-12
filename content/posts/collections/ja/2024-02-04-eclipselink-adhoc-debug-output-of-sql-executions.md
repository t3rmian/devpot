---
title: EclipseLinkで出力クエリをその場でデバッグする方法
url: eclipselink-sql実行-デバッグ出力
id: 124
category:
- jpa: JPA
tags:
- eclipselink
- ロギング
- パフォーマンス
- デバッグ
author: Damian Terlecki
date: 2024-02-04T20:00:00
---

もし適切なロギング設定がないEclipseLinkアプリケーションをデバッグすることになったら、ELが生成する最終的なSQLクエリを取得するのが難しいと感じるかもしれません。通常、ELの永続化設定には
`eclipselink.logging.level`と`eclipselink.logging.logger`プロパティがあります。
これらがロギングの振る舞いを制御します。`FINE`レベルを使えば、複雑なプロセスのSQLクエリをログに出力し、それらが最適でないかどうかをチェックできます。

ロギングが無効かアクセスできない状況でも、JVMのデバッグポートが利用可能であれば、ログが出力ストリームに書き込まれる場所を探すことができます。EclipseLinkの場合、ほとんどのロギングは
`org.eclipse.persistence.logging.SessionLog`インターフェースを通じて実装されています。

```java
public interface SessionLog extends Cloneable {
    //... log-related methods
    public boolean shouldLog(int level);
    public boolean shouldLog(int level, String category);
    public void log(int level, String message);
    //12 overloads...
    public void throwing(Throwable throwable);
    public void severe(String message);
    public void warning(String message);
    //5 more JDK-related log-level methods...
    public void logThrowable(int level, Throwable throwable);
    public void logThrowable(int level, String category, Throwable throwable);
    //...
}
```
これらのメソッドにブレークポイントを置くことはできますが、ログを出力するすべてのメソッドは、不要なオブジェクトの作成を防ぐために（メッセージなしの）`shouldLog`メソッドで保護されています。
ロギング以外でデータベースクエリがコンテキストに含まれるもう一つの一般的な場所はプロファイリングです。

EclipseLinkのプロファイリングのほとんどは、`org.eclipse.persistence.internal.sessions.AbstractSession`内の`startOperationProfile`操作から始まります。これは内部メソッドであり、変更される可能性がありますが（バージョン2.7）、
必要に応じて自由にデバッグすることができます。

<img src="/img/hq/debug-profiling-eclipselink.png" title="EclipseLink AbstractSessionプロファイラ" alt="EclipseLink AbstractSessionプロファイラ">

IDEの助けを借りれば、クエリの詳細をローカルコンソールに出力できます。
ブレークポイントの条件として、それがステートメント実行クエリであるかどうかを確認します `SessionProfiler.StatementExecute.equals(operationName) && query != null`。
出力については、SQL文字列と、バインドパラメータを表すオプションの変換行を連結します `return String.format("%s%nBind parameters: %s%n%s",query.getSQLString(), java.util.Objects.toString(query.getQueryMechanism().getModifyRow(), ""), java.util.Objects.toString(query.getQueryMechanism().getTranslationRow(), ""));`。

<img src="/img/hq/debug-output-sql-executions-eclipselink.png" title="EclipseLink AbstractSessionプロファイラのデバッグ" alt="EclipseLink AbstractSessionプロファイラのデバッグ">

実行を中断せずに、サンプル出力が生成されます。

```sql
CREATE TABLE EMPLOYEE (ID BIGINT NOT NULL, DEPARTMENT VARCHAR, NAME VARCHAR, ADDRESS_ID BIGINT, PRIMARY KEY (ID))
Bind parameters: EmptyRecord()
SELECT * FROM SEQUENCE WHERE SEQ_NAME = 'SEQ_GEN'
Bind parameters: EmptyRecord()
INSERT INTO SEQUENCE(SEQ_NAME, SEQ_COUNT) values ('SEQ_GEN', 0)
Bind parameters: EmptyRecord()
UPDATE SEQUENCE SET SEQ_COUNT = SEQ_COUNT + ? WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN
	PREALLOC_SIZE => 50)
SELECT SEQ_COUNT FROM SEQUENCE WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN)
INSERT INTO EMPLOYEE (ID, DEPARTMENT, NAME, ADDRESS_ID) VALUES (?, ?, ?, ?)
Bind parameters: DatabaseRecord(
	EMPLOYEE.ID => 1
	EMPLOYEE.DEPARTMENT => Marketing
	EMPLOYEE.NAME => Jane Smith
	EMPLOYEE.ADDRESS_ID => null)
	SALARY.employee_id => null)
```

<img src="/img/hq/debug-profiling-console-eclipselink.png" title="EclipseLink AbstractSessionプロファイラのIDEコンソールデバッグ出力" alt="EclipseLink AbstractSessionプロファイラのIDEコンソールデバッグ出力">

アプリケーションプロセスとクエリを関連付けるために、より関連性の高い情報を常に出力することができます。
時間、スレッドID、クエリアクセッサの接続、またはカスタムコンテキスト情報を追加することを考えてみてください。
