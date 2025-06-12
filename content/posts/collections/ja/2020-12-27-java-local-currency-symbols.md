---
title: Javaで全ての通貨記号を取得する方法
url: java-ローカル-通貨記号
id: 46
category:
- java: Java
tags:
- jvm
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

Javaで通貨を表示するのは、見た目ほど簡単ではありません。特に、コードではなく現地の通貨記号を表示したい場合はそうです。
通貨を扱う基本クラスは `java.util.Currency` と `java.util.Locale` です。利用可能な各通貨の名前、記号、コードを表示するために、私たちの最初のアプローチは次のようになるかもしれません。

```java
class Scratch {

    public static final String CURRENCY_DISPLAY_FORMAT = "Display name: %s, symbol: %s, code: %s, numericCode: %s";

    private static String formatCurrency(Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(), currency.getSymbol(), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }

    public static void main(String[] args) {
        System.out.println("================ Currencies displayed with DISPLAY Locale ================");
        System.out.println(Currency.getAvailableCurrencies()
                .stream()
                .map(Scratch::formatCurrency)
                .collect(Collectors.joining(System.lineSeparator()))
        );
    }

}
```

非常に便利なメソッド `Currency.getAvailableCurrencies()` から始めると、JREが提供するすべての通貨を取得できます。次に、定義されたフォーマットに従って各通貨を表示します。残念ながら、多くの場合、期待される記号は得られません。

```plaintext
...
Display name: Norwegian Krone, symbol: NOK, code: NOK, numericCode: 578
Display name: Indonesian Rupiah, symbol: IDR, code: IDR, numericCode: 360
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: PHP, code: PHP, numericCode: 608
...
```

NOKの場合、現地の記号は "kr"、ルピアは "Rp" などになります。この結果はもちろんドキュメントに従って有効です。
> デフォルトのDISPLAYロケールに対するこの通貨の記号を取得します。  
> 例えば、米ドルの場合、デフォルトのロケールが米国であれば記号は "$" ですが、他のロケールでは "US$" になることがあります。  
> 記号が決定できない場合は、ISO 4217通貨コードが返されます。

## ローカル通貨記号

目的の記号を取得するには、オーバーロードされたメソッド `public String getSymbol(Locale locale)` を使用する必要があります。さらに、ここに任意の*Locale*を渡すだけでは不十分で、同様の結果になる可能性が高いです。特定の国の現地通貨記号を表示したい場合は、同じ国の*Locale*を渡す必要があります。このような関係 *Locale* – *Currency* は、次のコードで作成できます。

```java
    private static Currency getLocaleCurrency(Locale locale) {
        try {
            return Currency.getInstance(locale);
        } catch (IllegalArgumentException iae) {
            System.err.printf("For locale: %s, %s; country code: %s is not a supported ISO 3166 country code%n",
                    locale.getDisplayName(), locale, locale.getCountry());
            return null;
        }
    }
```

この場合、`Locale.getAvailableLocales()` メソッドからJREがサポートするすべてのロケールのリストを取得します。しかし、このリストには `Currency.getInstance()` メソッドでサポートされていないロケールも含まれています。その場合、*IllegalArgumentException* がスローされます。例としては、特定の国コードなしで言語のみを定義するロケールがあります。

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: English (Europe), en_150; country code: 150 is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

ロケールを通貨にリンクした後、フォーマットを調整するだけです。

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

そして最終的なコードは次のようになります。

```java
    public static void main(String[] args) {
        System.out.println("================ Currencies displayed with local Locale ================");
        System.out.println(Arrays.stream(Locale.getAvailableLocales())
                .collect(HashMap<Locale, Currency>::new,
                        (map, locale) -> map.put(locale, getLocaleCurrency(locale)), HashMap<Locale, Currency>::putAll)
                .entrySet()
                .stream()
                .filter(entry -> entry.getValue() != null)
                .map(entry -> formatCurrency(entry.getKey(), entry.getValue()))
                .collect(Collectors.joining(System.lineSeparator()))
        );
    }
```

ストリームの値をマッピングするために、*collect*メソッドのパラメータとして、手動で構築した*supplier*、*accumulator*、*combiner*の値を提供する必要があります。ここでは`java.util.stream.Collectors.toMap()`を使用できません。このコレクターは、我々の場合に期待される*null*値をサポートしていないためです。

最後に、期待される通貨記号がコンソールに表示されるはずです。

```plaintext
...
Display name: norske kroner, symbol: kr, code: NOK, numericCode: 578
Display name: Rupiah Indonesia, symbol: Rp, code: IDR, numericCode: 360
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: ₱, code: PHP, numericCode: 608
...
```

そして、オプションで重複排除した後、サンプルアプリケーションでは次のようになります。

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-currency.png" alt="通貨記号の選択を表示するウィンドウのスクリーンショット" title="NutrieVal – 好みの通貨の選択">
</a>
</figure>

## CVE – カーボベルデ・エスクード

[カーボベルデ・エスクード](https://en.wikipedia.org/wiki/Cape_Verdean_escudo)という1つの通貨だけが、正しい記号を表示しないようです。[cifrão](https://en.wikipedia.org/wiki/Cifr%C3%A3o)（Unicodeに相当するものなし）または "Esc" の代わりに、空のテキストが表示されます。実際には、ASCIIコード表に基づいて2つの文字が返されます。*垂直タブ*の後に*水平スペース*が続きます。

<img src="/img/hq/java-cve-escudo.png" alt="デバッガのスクリーンショット" title="デバッガのスクリーンショット">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)
