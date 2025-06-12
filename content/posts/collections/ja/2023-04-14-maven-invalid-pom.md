---
title: 未解決のMavenプロパティによる無効なPOM
url: maven-pom-invalid
id: 108
category:
- java: Java
tags:
- maven
- jaxws
- jakarta
author: Damian Terlecki
date: 2023-04-14T20:00:00
---

Mavenは`pom.xml`設定ファイルを使用してプロジェクトのビルドを管理します。ファイルを解析する際、
ツールはプロジェクトの依存関係を解決し、アーティファクトをビルドするために必要なライブラリやツールを決定します。
この過程で、Mavenは外部のPOMファイルも解析して、推移的な依存関係を判断します。

## 未解決のMavenプロパティ

リモートライブラリのPOMファイルに、構文エラーというよりは論理的なエラーが含まれていることがあります。
この種の問題の原因の一つは、存在しない[mavenプロパティ](https://maven.apache.org/pom.html#Properties)を参照する式の使用です。
依存関係の処理中にエラーが発生した場合、Mavenは推移的なアーティファクトの読み込みをスキップし、次のような警告が出力されます。

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details' alt='[WARNING] The POM for com.sun.xml.ws:jaxws-rt:jar:2.2.10 is invalid, transitive dependencies (if any) will not be available, enable debug logging for more details'>

`pom.xml`ライブラリで宣言された依存関係が、基本的に無視され、プロジェクトで解決不可能になっていることにすぐに気づくでしょう。
原因についてさらに詳しく知るには、`-X`パラメータを追加します。これは`--debug`パラメータの短い省略形です。

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' for com.sun:tools:jar must specify an absolute path but is ${tools.jar} @

この特定のケースでは、Mavenは`${tools.jar}`式を評価できません。
`pom.xml`ファイルを見ると、この式は親POMの1つでシステムの`tools`依存関係を定義するために必要であることがわかります。

```xml
<!--...-->
<profiles>
    <!--...-->
    <profile>
        <id>default-tools.jar</id>
        <activation>
            <file>
                <exists>${java.home}/../lib/tools.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../lib/tools.jar</tools.jar>
        </properties>
    </profile>
    <profile>
        <id>default-tools.jar-mac</id>
        <activation>
            <file>
                <exists>${java.home}/../Classes/classes.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../Classes/classes.jar</tools.jar>
        </properties>
    </profile>
</profiles>
<!--...-->
<dependencyManagement>
    <dependencies>
        <!-- JDK dependencies -->
        <dependency>
            <groupId>com.sun</groupId>
            <artifactId>tools</artifactId>
            <version>1.6</version>
            <scope>system</scope>
            <systemPath>${tools.jar}</systemPath>
        </dependency>
    </dependencies>
    <!--...-->
</dependencyManagement>
<!--...-->
```

この特定のアーティファクトの依存関係をさらに検証すると、このサブモジュールではシステムの依存関係が使用されていないと結論付けることさえあるかもしれません。
残念ながら、`${java.home}/../lib/tools.jar`または`${java.home}/../Classes/classes.jar`の場所にファイルがないため、変数`${tools.jar}`は初期化されません。

この例に特有の問題は、JDK 11以降のバージョンに関連しています。このバージョンでは、言及されたツールが削除されました。
この変更は`jaxws-rt:2.3.x`からサポートされており、これにはこのライブラリに関連する仕様のアップグレードも伴います。

全体として、この問題はより一般的であり、Mavenが外部の依存関係を解決する際に式を評価できない状況に一般化できます。
これに対して我々は何か影響を与えることができるのでしょうか？

## POMファイルの式評価

プロパティソースの評価順序は、Maven v3/4では[`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175)で実装されており、
次のように単純化できます。
- Javaプロパティ – `-Dkey=value`;
- Mavenプロパティ – `<properties><key>value</key></properties>`;
- 環境変数 – `set/export key=value`。

マルチモジュールプロジェクトでは、Mavenプロパティは同じプロジェクト内のサブモジュールに継承されることがあります。しかし、これらの変数はプロジェクトの外部依存関係に自動的に伝播されるわけではありません。
一方、Javaと環境変数はMavenの処理の開始時に初期化されるため、実行中に追加しても評価には影響しません。
さらに、外部依存関係の場合、Java変数は環境変数のレベルに統合されます（[MNG-7563](https://issues.apache.org/jira/browse/MNG-7563)）。

上記のルールを知っていれば、外部の`pom.xml`でMavenプロパティをいくつかの異なる方法で初期化できます。例えば：
- 環境変数（Unix系システムでのドットを含む変数のエクスポートに関する問題に注意）。
- コマンドラインを使用したJavaプロパティの初期化 `mvn -Dkey=value validate`。
- コマンドの開始時の環境変数 `key=value mvn validate`。
- Javaプロパティを設定するプロジェクト相対のMaven設定ファイル `.mvn/maven.config` `-Dkey=value`。
- 環境変数を設定するグローバルな実行コマンド（例：`~/.mavenrc`） `set/export key=value`（IntelliJでの問題、例：[IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner)に注意）。

最後の手段としては、もちろん手動で（あるいは間接的に）依存関係をダウンロードし、アーティファクトのコンパイル/ビルドパスに追加することです。

> 代替のビルドツールとして、Gradle v4-8はここで少しうまく機能します。影響を受けない依存関係に対してエラーをスローせず、アーティファクトは正しくインポートされます。
