---
title: OWASP Java HTML SanitizerのCSSスキーマプロパティを上書きまたはマージする方法
url: owasp-java-html-sanitizer-style-override
id: 127
category:
- java: Java
tags:
- セキュリティ
- html
author: Damian Terlecki
date: 2024-04-07T20:00:00
---


[`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer)
は、JavaでサードパーティのXSS HTMLから保護するための、おそらく最も成熟したソリューションの1つです。
`org.owasp.html.Sanitizers`パッケージで定義された基本的な事前パッケージポリシーと、`org.owasp.html.examples`配下にあるより複雑なものが付属しています。
また、`org.owasp.html.HtmlPolicyBuilder`を通じて、事前定義またはカスタムのスタイルで独自のポリシーを構築することもできます。

## CSSスタイルプロパティの重複した互換性のない定義

OWASP Java HTML Sanitizerの制約の1つに、公開APIを使って既に定義済みのCSSスタイルプロパティを上書きできないというものがあります。
例として`CssSchema.DEFAULT`を見てみましょう。これは`allowStyling()`で構築されたポリシーで暗黙的に使用され、すべての負のマージンプロパティを除外します。

```java
import org.junit.Test;
import org.owasp.html.CssSchema;
import org.owasp.html.CssSchemaUtils;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class SanitizerTest {

    @Test
    public void givenAllowDefaultStyling_whenSanitize_thenRemoveNegativeMargin() {
        String sanitizedContent = new HtmlPolicyBuilder()
                .allowStyling()
                .allowElements("div")
                .toFactory()
                .sanitize("""
                        <div style="margin-left:10px;margin-top:-10px"/>
                        """);
        assertEquals("""
                <div style="margin-left:10px">
                </div>""", sanitizedContent);
    }
}
```

> サンプルはバージョン`20240325.1`に基づいています。ただし、GuavaがJavaコレクションフレームワークに置き換えられる前のレガシーバージョンも同様です。
> このバージョンには`java8-shim`パックも付属しています。これには`org.owasp.shim.Java8Shim`ユーティリティが含まれており、Java 10のコレクションファクトリ用のアダプタを提供し、Java 8で使用できます。

仮に、デフォルトのCSSスキーマを再利用しつつ、負の`margin-top`プロパティを許可したいとしましょう。
このプロパティだけで独自のスキーマを構築しますが、公開APIである`CssSchema.union()`や`PolicyFactory.and()`を使ってデフォルトのスキーマと結合しようとすると、
`IllegalArgumentException`が発生します。

```java
//...
public class SanitizerTest {
    //...
    private final static CssSchema.Property NEGATIVE_MARGIN_TOP_PROPERTY =
            new CssSchema.Property(
                    CssSchemaUtils.BIT_QUANTITY | CssSchemaUtils.BIT_NEGATIVE, // allowed value group types (constants exposed from CssSchema)
                    Set.of("auto", "inherit"), // allowed literals
                    Map.of() // map of CSS function start tokens like "rgb(" to another schema property key like "rgb()" that defines its arguments
            );
    private final static CssSchema CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP =
            CssSchema.withProperties(Map.of(
                    "margin-top",
                    NEGATIVE_MARGIN_TOP_PROPERTY
            ));

    @Test
    public void givenDefaultCssSchema_whenUnion_thenIllegalArgumentException() {
        assertThrows("Duplicate irreconcilable definitions for margin-top",
                IllegalArgumentException.class,
                () -> new HtmlPolicyBuilder().allowStyling(CssSchema.union(
                        CssSchema.DEFAULT,
                        CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP
                ))
        );
    }

    @Test
    public void givenDefaultCssSchemaPolicy_whenUnion_thenIllegalArgumentException() {
        PolicyFactory negativeMarginTopPolicy = new HtmlPolicyBuilder()
                .allowStyling(CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP)
                .toFactory();
        assertThrows("Duplicate irreconcilable definitions for margin-top",
                IllegalArgumentException.class,
                () -> new HtmlPolicyBuilder()
                        .allowStyling(CssSchema.DEFAULT)
                        .toFactory().and(negativeMarginTopPolicy)
        );
    }
}
```

> カスタムプロパティの定義方法に関するその他のサンプルについては、`CssSchema`内の様々な事前定義プロパティをご覧ください。

## CssSchemaの上書き

サニタイザの実装の多くはfinalです。
幸いにも、スキーマ定義全体をコピーして修正することなく、この厳格な検証を回避する方法があります。
簡潔な公開APIの他に、`CssSchema`は、同じパッケージ下で独自の拡張機能を記述するのに十分なパッケージプライベートインターフェースを公開しています。

`CssSchema.allowedProperties()`、`CssSchema.forKey()`、および`CssSchema.withProperties()`を通じて、
上書きされたスキーマを簡単に構築できます。偶然にも、プロパティタイプを定義するために必要な定数を、コンパイル時または実行時の定数として公開することもできます。

> ライブラリでコンパイル時定数が変更されると、コードの再コンパイルが必要になります。
> 一方で、カスタムCSSプロパティを作成する際の挙動の非互換性のため、そのような変更は考えにくいでしょう。
> バイナリ互換性が維持されている場合に、ソース/挙動の非互換性から保護する方法についての豆知識として捉えてください。

```java
package org.owasp.html;

import java.lang.invoke.MethodHandles;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public class CssSchemaUtils {

    public static final int BIT_QUANTITY = CssSchema.BIT_QUANTITY; // compile-time constant
    public static final int BIT_NEGATIVE;

    static {
        try { // or a runtime constant
            BIT_NEGATIVE = (int) MethodHandles.lookup().in(CssSchema.class)
                    .findStaticVarHandle(CssSchema.class, "BIT_NEGATIVE", int.class)
                    .get();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    /* other BIT_.. constants */

    public static CssSchema override(CssSchema... cssSchemas) {
        if (cssSchemas.length == 1) {
            return cssSchemas[0];
        }
        Map<String, CssSchema.Property> properties = Maps.newLinkedHashMap();
        for (CssSchema cssSchema : cssSchemas) {
            for (String name : cssSchema.allowedProperties()) {
                if (Objects.isNull(name)) {
                    throw new NullPointerException("An entry was returned with null key from cssSchema.properties");
                }
                CssSchema.Property newProp = cssSchema.forKey(name);
                if (Objects.isNull(newProp)) {
                    throw new NullPointerException("An entry was returned with null value from cssSchema.properties");
                }
                properties.put(name, newProp);
            }
        }
        return CssSchema.withProperties(properties);
    }
}
```

この知識があれば、他のマージ戦略も実装できるかもしれません。
実際にどのように見えるかを見てみましょう。


```java
//...
public class SanitizerTest {
    //...
    @Test
    public void givenDefaultCssSchemaPolicyPackageOverrideNegativeMargin_whenSanitize_thenAllowNegativeMargin() {
        String sanitizedContent = new HtmlPolicyBuilder()
                .allowStyling(CssSchemaUtils.override(
                        CssSchema.DEFAULT,
                        CSS_SCHEMA_WITH_NEGATIVE_MARGIN_TOP
                ))
                .allowElements("div")
                .toFactory()
                .sanitize("""
                        <div style="margin-left:10px;margin-top:-10px"/>
                        """);
        assertEquals("""
                <div style="margin-left:10px;margin-top:-10px">
                </div>""", sanitizedContent);
    }
}
```

`CssSchema`とは対照的に、選択した`PolicyFactory`のスタイルをクリーンに上書きする方法はないようです。
例えば、`EbayPolicyExample`を異なるスタイリングでテストするには、定義全体をコピーして別途維持する必要がありますが、
少なくとも暗黙の`CssSchema.DEFAULT`に対して同じことをする必要はありません。

<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="OWASP Java HTML Sanitizerのスタイル上書きテスト結果" title="OWASP Java HTML Sanitizerのスタイル上書きテスト結果">

独自のポリシーを定義する場合と同様に、非常に注意が必要です。
[セキュリティへの他の影響](https://github.com/OWASP/java-html-sanitizer/pull/184)の可能性を考慮してください。
ホワイトリストに登録されたプロパティとの相互作用を理解し、自分のコンテキストでの使用を検証してください。
