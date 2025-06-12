---
title: WebLogic Filtering Classloaderのヒント
url: weblogic-ライブラリ-競合
id: 92
category:
- jee: JEE
tags:
- クラスローディング
- weblogic
author: Damian Terlecki
date: 2022-08-07T20:00:00
---

WebLogicに、アプリケーションにバンドルされた特定のバージョンの依存関係をロードさせる方法を探しているなら、
正気を保つためのヒントをいくつか紹介します：
1. アプリケーションサーバーとしてのWebLogicには、あなたのアプリケーションでも使用している可能性のあるライブラリが多数同梱されています（おそらくそれらの異なるバージョン）。
2. WebLogicは、クラスのロード中に標準の親委譲に従います。要求されたクラスは、まずシステムによって検索され（優先され）、次に親、
   そしてアプリケーションのクラスローダーによって検索されます。
3. Filtering Class Loaderは、WebLogicの機能で、デプロイヤーがこのプロセスに影響を与え、その一部を反転させることを可能にします。これにより、Tomcatと同様の
   ロードを実現できます。

Filtering Class Loaderは、WARアプリケーションまたはEARアプリケーションのいずれかをデプロイするときに使用できます。
アーカイブの種類に応じて、2つの異なるディスクリプタが使用されます：
- weblogic-application.xml (EAR)
- weblogic.xml (WAR)

## EARディスクリプタ

EARディスクリプタについては、[スキーマバージョンリスト](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-application/index.html)に基づいて一致するXMLスキーマ定義を見つけることができます。
`xsi:schemaLocation`マッピングを、お使いのWLSに一致するバージョンに置き換えてください。次にディスクリプタに移りますが、
重要な設定は`prefer-application-packages`と`prefer-application-resources`です。

前者は、WLSモジュールの代わりにアプリケーションからロードすべき
クラスを設定するために使用されます。後者のプロパティは、サービスローダー設定ファイルのような非クラスリソースに使用できます。

以下に、WLS 12.1.3にバンドルされている`commons-io:commons-io`パッケージ（*wlserver/<wbr>modules/<wbr>features/<wbr>weblogic.server.merged.jar*）を上書きする方法、
およびJAX-RS（WLS 12.2）の実装プロバイダーをアプリケーションのものに置き換える方法を示します。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-application
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-application"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-application http://xmlns.oracle.com/weblogic/weblogic-application/1.8/weblogic-application.xsd">

    <prefer-application-packages>
        <package-name>org.apache.commons.io.*</package-name>
    </prefer-application-packages>
    <prefer-application-resources>
        <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
    </prefer-application-resources>

</weblogic-application>
```

このディスクリプタの正しい場所は`EAR/META-INF/weblogic-application.xml`です。デフォルトでは、`src/main/application/META-INF/weblogic-application.xml`に置くと、
`maven-ear-plugin`によって上記のディレクトリにバンドルされます。そうでなければ、プラグインの`earSourceDirectory`設定プロパティが、`META-INF`ディレクトリを置くべき場所を定義します。

## WARディスクリプタ

`weblogic.xml`のスキーマの場所も、[WLSのバージョンに固有](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)です。
WLS 12.1.3以降、EARディスクリプタと比較してバージョンオフセットがあることにも注意してください。
スキーマは異なりますが、設定は上記と同様です。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-application-packages>
            <package-name>org.apache.commons.io.*</package-name>
        </prefer-application-packages>
        <prefer-application-resources>
            <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
        </prefer-application-resources>
    </container-descriptor>
</weblogic-web-app>
```

今回は、ディスクリプタを`WAR/WEB-INF/weblogic.xml`に置く必要があります。`maven-war-plugin`を使用すると、デフォルトで`src/main/webapp/WEB-INF/weblogic.xml`から取得されます。

WARデプロイメントでは、追加の設定が可能です。パッケージクラスと依存関係の間に競合するクラスバージョンがあるとします。
そのような場合、クラスローダーに依存関係やWLSのクラスよりも自分のクラスを優先させることができます。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-web-inf-classes>true</prefer-web-inf-classes>
    </container-descriptor>
</weblogic-web-app>
```

このオプションを`prefer-application-packages`/`prefer-application-resources`と組み合わせることは無効です。

## トラブルシューティング

実行時に正しいクラス/リソースが適切にロードされているか、疑問に思うかもしれません。
多くの場合、競合の明確な兆候は`java.lang.NoSuchMethodError`例外です。
これは実行時に現れ、ロードされたクラスに参照されているメソッドシグネチャが欠落していることを示します。
その他のあまり一般的でないエラーには、以下が含まれます：
- `java.lang.AbstractMethodError`
- `java.lang.IllegalAccessError`
- `java.lang.IncompatibleClassChangeError`
- `java.lang.NoSuchFieldError`
- `java.lang.NoSuchMethodError`

`java.lang.LinkageError`を継承する例外のツリーで、完全なリストを見つけることができます。

時には明確なエラーがない場合もありますが、クラスのソースが不確かな場合があります。
そのような場合、例えば次のようにしてソースをすばやく見つけることができます：
- `Thread.currentThread().getContextClassLoader().loadClass("org.apache.commons.io.IOUtils").getProtectionDomain().getCodeSource().getLocation();`
- `Thread.currentThread().getContextClassLoader().getResource("META-INF/services/javax.ws.rs.ext.RuntimeDelegate").getPath());`

### 互換性と競合

ほとんどの場合、WLSライブラリは`/oracle_common/modules`ディレクトリから提供され、JAR名に基づいてバージョンを確認できます。
バージョンサフィックスがない場合は、アーカイブを開いてMETA-INFマニフェストまたはMavenメタデータを探すことができます。

ソース/バイナリの互換性を見つけるには、JAPICC `japi-compliance-checker`があります。これは、システムのパッケージマネージャでインストールできる人気のツールで、
考えられるリンクの問題についてより多くの洞察を得ることができます。

そうでなければ、CAT（Classloader Analysis Tool）と呼ばれるWLS固有のツールがあります。
Webアプリケーションとして、これは完全なWLSインストールにバンドルされており、デフォルトで`/wls-cat`コンテキストでデプロイされます。

<img src="/img/hq/wls-cat-conflicts.png" alt="WLS CAT – クラス競合" title="WLS CAT – クラス競合">

左のツリーでアプリケーションを選択し、「Analyze Conflicts」タブに移動して、競合している可能性のあるパッケージと
提案された解決策を確認します。フィルタリングを設定すると、リストは短くなるはずです。「refresh」を押して「Classloader Tree」に移動し、フィルタリングを確認します。
直接のEJB/WARクラスと依存関係の競合は、適切に検出されるはずです。

<img src="/img/hq/wls-cat-classloaders-hierarchy.png" alt="WLS CAT – FilteringClassLoader" title="WLS CAT – FilteringClassLoader">

スタンドアロンEJBデプロイメント用の別のフィルタリングクラスローダーもあるようですが、それをクリーンに設定する方法は見つかりませんでした。
`weblogic-application.xml`も`weblogic.xml`ディスクリプタもここには適合せず、「-ejb」のものにもそのような設定プロパティはありません。
したがって、この場合はEJBモジュールをEARにラップすることを提案します。

### Java 9サポート

最後に、古いWLSバージョンでは、次のエラーに遭遇する可能性があります：

> java.lang.UnsupportedClassVersionError: module-info has been compiled by a more recent version of the Java Runtime (class file version 53.0), this version of the Java Runtime only recognizes class file versions up to 52.0

一部のライブラリは、Java 9のモジュールカプセル化のサポートを追加しました。ライブラリはJava 8で実行できますが、`module-info`が付属しており、通常はライブラリのルートまたは`META-INF/versions`ディレクトリにあります。
WLSの場合、ファイルがJava 9用にコンパイルされているため、実行時にエラーを引き起こす可能性があります：
- `beans.xml`で設定可能なデフォルトのCDIスキャンが原因
- CATスキャンを妨げる

最も簡単なアプローチは、関連するフェーズ中に`truezip-maven-plugin`プラグインなどを使用してライブラリから削除することです。
Java 8 WLSで実行されているWAR内にバンドルされた*log4j*の互換性のないファイルを削除する次の設定を見てください：

```
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>truezip-maven-plugin</artifactId>
        <version>1.2</version>
        <executions>
          <execution>
            <id>remove-log4j2-java9-meta</id>
            <goals>
              <goal>remove</goal>
            </goals>
            <phase>package</phase>
            <configuration>
              <filesets>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-api-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-core-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
              </filesets>
            </configuration>
          </execution>
        </executions>
      </plugin>
```

CATがスタックトレースで互換性のないmodule-infoの場所を示さない場合は、展開されたディレクトリですべてのjarをgrepするだけです。
jarはバイナリファイルですが、通常はいくつかの有効な一致が得られるはずです。そうでない場合は、標準の`jar` Javaツールを使用してください：`jar tf <JAR> | grep module-info`。
