---
title: Maven Shade PluginのPropertiesTransformerの例
url: maven-shade-plugin-properties-transformer
id: 112
category:
- java: Java
tags:
- maven
- maven-shade-plugin
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

Maven Shade Pluginは、プロジェクトのビルドプロセス中に依存関係を結合することができる拡張機能です。このプラグインの
目的は、アプリケーションのすべての依存関係とそのコードを含む単一のJARファイルを作成することです。

このプロセス内で、`*.properties`のような設定ファイルのマージが問題になることがあります。デフォルトでは、
最後に見つかったファイルが結果のアーティファクト内でその場所を勝ち取ります。
このプラグインは、そうした問題を解決し、リソースマージの振る舞いを制御するために、トランスフォーマーと呼ばれる設定を提供しています。

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='リソースの重複を報告するMaven Shade Plugin' alt='リソースの重複を報告するMaven Shade Plugin'>

## *PropertiesTransformer*変換

プラグイン自体は、複数の事前にインストールされたトランスフォーマーを提供しています。より複雑なものは、外部プロバイダーからインポートできます。
バージョン3.2.2以降、開発者は`org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`の実装も提供しています。
プロパティの結合順序を変更したい場合、その名前は非常に有望に聞こえるかもしれません。
アプリケーションが優先される（通常は上書きされる）プロパティをロードするようにしたい場合があります。

[*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)を見て、
サンプル設定（以下参照）を試すと、期待した結果を得るのが難しいかもしれません。
プロパティの説明は少し表面的に思えるかもしれませんが、だからこそ、例でその振る舞いを見るのが最善です
（[バージョン3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java)）。

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- required configuration -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- optional configuration -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

モジュールAとモジュールBにそれぞれ2つの`configuration/application.properties`ファイルがあるとします。
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
*maven-shade-plugin*の*shade*ゴールと*PropertiesTransformer*が両方の依存関係を結合すると、デフォルトで次の`configuration/application.properties`ファイルが生成されます。
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***


### *ordinalKey*と*defaultOrdinal*

ファイルがマージされる順序は、`ordinalKey`によって制御されます。これは、その値が数値順序であるプロパティの名前を指します。
プロパティファイルにそのようなキーが含まれていない場合、その順序は`defaultOrdinal`（欠落している場合は0）によって定義されます。
モジュールAのファイルでデフォルトよりも高い順序を定義することで：

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```

出力では、モジュールAのプロパティ`prop2`が得られ、事実上、逆の順序を達成します。
さらに、トランスフォーマーは人工的なキーを削除します。

```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

`alreadyMergedKey`は、ファイルの優先順位を示す`boolean`値型（例：`true` *String*）のプロパティ名を定義します。
これにより、トランスフォーマーはこのファイルに他のファイルをマージしません。

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
このようなプロパティの場合、モジュールAのプロパティのコピーが得られ、ここでも`already_merged`合成キーが削除されます。
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

複数のファイルでこのようなキーが`true`値で出現することは許可されておらず、エラーになります。

***


### *reverseOrder*

`reverseOrder`オプションを使用して、ファイルの連結順序を逆にすることができます。残念ながら、この機能は
同じ順序値を持つファイル間の順序を逆にすることはありません。つまり、`<reverseOrder>true</reverseOrder>`と2つの
プロパティファイルに対して：

```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
それでも（`reverseOrder`の値に関係なく）同じ結果が得られます。
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

逆転は、`ordinalKey`で順序を定義した後、かつ異なる順序のファイル間でのみ機能します。

***

## まとめ

`PropertiesTransformer`は、プロパティファイルの基本的なマージを可能にします。ファイルは最初に
`java.util.Properties`を使用してロードされることを知っておく価値があります。これは、同じファイル内の重複が
最新の（一番下に近い）プロパティで上書きされることを意味します。

ファイルのマージ順序を決定したり、複数のファイルの中から優先ファイルを指定したりするには、人工的なキーを含める必要があります。
残念ながら、同じまたはデフォルトの順序値を持つファイル間の順序を逆にすることはできません。

したがって、少し異なるマージ動作（例えば、人工的なキーを追加する必要がないなど）が必要な場合は、カスタムトランスフォーマーを備えた外部アドオンパックを探してください。
`<dependencies></dependencies>`タグを`<plugin></plugin>`内に使用することで、そのような依存関係を簡単に追加できます。
単にプロパティを逆の順序で結合したい場合は、
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0)をご覧ください。

