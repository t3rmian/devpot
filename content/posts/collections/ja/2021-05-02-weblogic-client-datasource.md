---
title: WebLogicクライアントのデータソースルックアップ
url: weblogic-クライアント-データソース-ルックアップ
id: 65
category:
- jee: JEE
tags:
- weblogic
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

WebLogicサーバー用のEJBテクノロジーでアプリケーションを作成する場合、データベースへのアクセスは通常EJBビーンを介して行われます。
しかし、SEクライアントの観点からは、システムや統合テストを検証するために、データベースへの直接アクセスが必要になることがあります。

データベースへの接続を提供する基本要素は、WebLogicで設定されたデータソースです。
コンテナ管理の環境にいれば、InitialContextまたは`@Resource`アノテーションを介していつでもデータソースへの参照を見つけることができます。

## WebLogic 12.xクライアントのデータソース

しかし、クライアントレベルからWebLogic 12.xサーバーによって管理されるデータソースへの参照を取得するには、
いくつかの追加の前提条件があります。*wlfullclient.jar*ライブラリが必要になります。
デフォルトでは、このライブラリはMavenリポジトリには見つからず、WebLogicのインストールディレクトリから
独自にビルドする必要があります。
ライブラリのビルド方法は[ドキュメント](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D)に記載されています。
1. `WL_HOME/server/lib`ディレクトリを見つけます。
2. ライブラリをビルドします: `java -jar wljarbuilder.jar`。
3. ライブラリをクラスパスに追加します。`-cp`パラメータをいじる以外に、ローカルリポジトリにインストールしてMavenの依存関係に追加することもできます。
```bash
mvn install:install-file -Dfile=wlfullclient.jar -DgroupId=com.oracle -DartifactId=wlfullclient -Dversion=12.2.1.4 -Dpackaging=jar
```
```xml
<dependency>
    <groupId>com.oracle</groupId>
    <artifactId>wlfullclient</artifactId>
    <version>12.2.1.4</version>
    <scope>test</scope>
</dependency>
```

データソースのようなスタブが不要で、基本的なEJB通信で満足できる場合は、同じディレクトリにある*wlthint3client.jar*ライブラリを使用できます。
参照の取得はかなり標準的で、InitialContextを介して行われます。コンテキストファクトリとして、WebLogic固有のファクトリを指定します。
このクラスは、アタッチされたライブラリから提供されます。

```java
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Properties;

import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.Assert.assertTrue;

public class DatabaseIT {
    private final InitialContext context;
    private final DataSource dataSource;
    private final MyEjbService service;

    public DatabaseIT() throws NamingException {
        Properties env = new Properties();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory");
        env.put(Context.PROVIDER_URL, "t3://localhost:7001");
        context = new InitialContext(env);
        dataSource = (DataSource) context.lookup("my.datasource.jndi");
        service = (MyEjbService) context.lookup("my.ejb.service.jndi");
    }

    @Test
    public void testConnection() throws SQLException {
        service.foo();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM DUAL");
             ResultSet resultSet = statement.executeQuery()) {
            assertTrue(resultSet.next());
            assertThat(resultSet.getString(1), equalTo("X"));
        }
    }
}
```

私たちの統合テスト、というよりはシステムテストは、無事に終了するはずです。
適切なJNDI名は、WebLogicコンソールの*Services -> Data Sources*ツリーで接続設定を見つけることで確認できます。

<img src="/img/hq/wlfullclient-test.png" alt="データソースJNDI" title="データソースJNDI">

*wlfullclient.jar*ライブラリがない場合、データソースへの参照を取得しようとすると、次のエラーが表示されても驚かないでください。
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

さらに、クライアントライブラリがない場合、*weblogic.jndi.WLInitialContextFactory*がないため、コンテキストを初期化できません。
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## WebLogic 14.xクライアントのデータソース

*wlfullclient.jar*ライブラリは、バージョン12.2.1.3で既に**非推奨**になっていました。
現在、バージョン14.1.1.0では*wljarbuilder.jar*が見つからないため、*wlfullclient.jar*をビルドできなくなりました。
以前のバージョンのいずれかからビルドされた*wlfullclient.jar*パッケージを使用し、バージョン14.1.1.0との文書化されていない互換性を期待することもできます。

例えば、バージョン12.2.1.3または12.2.1.4のパッケージを使用すると、テストは問題なくパスしますが、12.1.3を使用すると、コンテキストの初期化中にエラーが発生します。
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

より互換性のある解決策は、*WL_HOME/modules*ディレクトリで必要なクラスを含むライブラリを見つけることです。
以前のバージョンでは、*wljarbuilder.jar*が*wlfullclient.jar*をビルドするのは、このディレクトリなどからです。
必要なクラスを見つけるには、次のコマンドを使用できます。

```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- データソースクラスは*WL_HOME/modules/com.bea.core.datasource6.jar*にあります。

新しいスタックトレースのパンくずをたどると、不足しているクラスが見つかります。
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

これらの3つのパッケージと*wlthint3client.jar*を使用すると、クライアント（Java SE）からWebLogic 14.1.1.0によって管理されるデータソースへの参照を取得し、データベースに正常にクエリを実行できます。
コンテナが認証済み接続を必要とする場合は、`Context.SECURITY_PRINCIPAL`と`Context.SECURITY_CREDENTIALS` InitialContextプロパティを介して認証情報を設定することを忘れないでください。

