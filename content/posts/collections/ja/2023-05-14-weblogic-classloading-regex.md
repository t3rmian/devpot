---
title: REGEXを使ったWebLogicの優先パッケージ指定
url: weblogic-優先ライブラリ-regex
id: 110
category:
- jee: JEE
tags:
- weblogic
- クラスローディング
- docker
author: Damian Terlecki
date: 2023-05-14T20:00:00
---

<img src="/img/hq/wls-prefer-application-packages.png" title='WebLogicサーバーディスクリプタの内容の抜粋。パッケージを分離しています: EL=アプリケーション, MOXy=WLS (metro-jax-wsと互換)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

Java EEサーバーであるWebLogicは、コンテナが標準で提供するライブラリを上書きする機能を提供しています。
[このような設定](/posts/weblogic-library-conflicts)は、WARアーティファクトの`WEB-INF`フォルダに配置された`weblogic.xml`ディスクリプタ、またはEARアーカイブの`META-INF`ディレクトリに置かれた`weblogic-application.xml`ディスクリプタを通じて可能です。

`prefer-application-packages`と`prefer-application-resources`要素の例は、それぞれクラスとリソースをロードするために簡単に見つけることができます。
サンプルのフィルタは、時に`.*`サフィックスで終わることもあり、終わらないこともあり、REGEXやGLOBに似ています。
しかし、ドキュメントではこのフォーマットの詳細が説明されておらず、複雑なフィルタリングを適用したい場合には、その詳細が非常に重要になります。

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

上記の設定は、`com.sample`、`com.sample.example`、`com.sample.example.subexample`のパッケージ、またはいずれかの組み合わせのクラスを優先するのでしょうか？
`com.sample.example`を除く`com.sample.*`のすべてのパッケージにマッチングするように設定するにはどうすればよいでしょうか？
クラスを完全名までフィルタリングできるのか、それともこの機能はパッケージにのみ適用されるのでしょうか（要素の名前から推測）？

## WebLogicのFilteringClassLoader

すべての疑問はコードに行き着きます。`FilteringClassLoader`は、WebLogicが提供する依存関係の中から探すべきクラスです。
この名前は、もう一つの便利なツールであるClassloader Analysis Toolのレポートから来ています。
このクラスは、T3プロトコルクライアントライブラリ`${WL_HOME}/server/lib/wlthint3client.jar`をロードするとすぐに見つかります。
より正確には、`weblogic.utils.classloaders`パッケージに存在します。

ライセンス上の理由により、このライブラリはMaven Centralリポジトリから解決できません。
検証目的で、WLSのインストールの代替として、公式dockerイメージのコンテナから抽出することができます。
```bash
#!/bin/bash
# Login, review and accept license at https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

さて、`weblogic.utils.classloaders.FilteringClassLoader`のバイトコードは、以下のアルゴリズムに翻訳されるようです。
1. パターンをロードし、末尾の`*`文字を削除します。
2. パターンが`.`で終わる場合、`{0,1}`サフィックスを追加します。
3. パターンに`^`プレフィックスを追加します。
4. `java.util.regex.Pattern`を作成し、`find()`メソッドを使用してクラス/リソースの完全名に対して`matcher(String)`を呼び出します。
5. マッチが見つからない場合、`loadClass/getResourceInternal/getResource/getResources`のロードを親クラスローダーに委譲し、それ以外の場合はアプリケーションによって提供されたクラス/リソースを返します。

これは、`prefer-application-packages`と`prefer-application-resources`要素が、REGEXを使用してパッケージとリソース、および個々のクラスを細かくフィルタリングできることを示しています。
開始文字と終了文字`*`および`.`に関して、いくつか追加があることに注意してください。

行末文字はパターンに追加されません。`find()`メソッドの使用と組み合わせることで、部分的な（`matches()`の代替としての）マッチングにより、フィルタリングされるパケットの数が増加します。
さらに、パッケージセパレータはここでは任意の文字マッチとして機能し、一見すると曖昧であり、非常にまれに意図したよりも広いフィルタリングにつながる可能性があります。

最後に、このメカニズムでは、サブパッケージをスキップする正規表現を定義できます。このような表現（例：`^com.sample(?!\.example$)`）は、他のマッチが見つからない場合、WLSが提供するライブラリセットへのフォールバックを引き起こします。
ただし、単純な表現を使用するようにしてください。過度のバックトラッキングは、アプリケーションの初期化時間の増加につながる可能性があります。

