---
title: Como obter todos os símbolos de moeda em Java
url: java-obter-simbolos-de-moeda
id: 46
category:
- java: Java
tags:
- jvm
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

Exibir moedas em Java não é tão fácil quanto parece, especialmente quando queremos exibir o símbolo da moeda local em vez de seu código. As classes base que lidam com moedas são `java.util.Currency` e `java.util.Locale`. Para exibir o nome, símbolo e código de cada moeda disponível, nossa primeira abordagem para este problema poderia ser assim:

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

Começando com um método muito conveniente `Currency.getAvailableCurrencies()`, podemos obter todas as moedas fornecidas pelo JRE. Em seguida, exibimos cada uma de acordo com o formato definido. Infelizmente, em muitos casos, não obteremos os símbolos esperados:

```plaintext
...
Display name: Norwegian Krone, symbol: NOK, code: NOK, numericCode: 578
Display name: Indonesian Rupiah, symbol: IDR, code: IDR, numericCode: 360
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: PHP, code: PHP, numericCode: 608
...
```

Para NOK, o símbolo local seria "kr", para rupias "Rp", etc. Este resultado é, claro, válido de acordo com a documentação:
> Obtém o símbolo desta moeda para o locale de EXIBIÇÃO padrão.
> Por exemplo, para o Dólar Americano, o símbolo é "$" se o locale padrão for os EUA, enquanto para outros locales pode ser "US$".
> Se nenhum símbolo puder ser determinado, o código da moeda ISO 4217 é retornado.

## Símbolos de moeda locais

Para obter o símbolo que queremos, precisamos usar um método sobrecarregado – `public String getSymbol(Locale locale)`. Além disso, não é suficiente passar qualquer *Locale* aqui, pois provavelmente obteremos um resultado semelhante. Se quisermos exibir o símbolo da moeda local de um determinado país, devemos passar o *Locale* do mesmo país. Tal relação *Locale* – *Currency* pode ser criada com o seguinte código:

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

Neste caso, recuperaremos uma lista de todos os Locales suportados pelo JRE a partir do método `Locale.getAvailableLocales()`. No entanto, esta lista também inclui locales que não são suportados pelo método `Currency.getInstance()` – nesse caso, uma *IllegalArgumentException* será lançada. Exemplos incluem locales que definem apenas o idioma, sem o código de país específico:

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: English (Europe), en_150; country code: 150 is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

Depois de vincular os locales às moedas, tudo o que precisamos fazer é ajustar nossa formatação:

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

E o código final ficará assim:

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

Para mapear os valores do stream, como parâmetros do método *collect*, devemos fornecer os valores construídos manualmente do *supplier*, *accumulator* e *combiner*. Não podemos usar `java.util.stream.Collectors.toMap()` aqui, pois este coletor não suporta valores *nulos* que são esperados em nosso caso.

Finalmente, os símbolos de moeda esperados devem aparecer em nosso console:

```plaintext
...
Display name: norske kroner, symbol: kr, code: NOK, numericCode: 578
Display name: Rupiah Indonesia, symbol: Rp, code: IDR, numericCode: 360
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: ₱, code: PHP, numericCode: 608
...
```

E após a desduplicação opcional, em um aplicativo de exemplo:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-currency.png" alt="Captura de tela de uma janela exibindo a escolha de um símbolo de moeda" title="NutrieVal – seleção de uma moeda preferida">
</a>
</figure>

## CVE – Escudo cabo-verdiano

Parece que apenas uma moeda – o [escudo cabo-verdiano](https://pt.wikipedia.org/wiki/Escudo_cabo-verdiano) – não exibe o símbolo correto. Em vez do chamado [cifrão](https://pt.wikipedia.org/wiki/Cifr%C3%A3o) (sem equivalente Unicode) ou "Esc", um texto vazio é exibido. Na verdade, dois caracteres são retornados, com base na tabela de códigos ASCII – uma *tabulação vertical* seguida por um *espaço horizontal*:

<img src="/img/hq/java-cve-escudo.png" alt="Captura de tela do depurador" title="Captura de tela do depurador">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)
