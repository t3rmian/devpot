---
title: How to get all currency symbols in Java
url: java-local-currency-symbols
id: 46
category:
  - java: Java
tags:
  - jvm
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

Displaying currencies in Java is not as easy as it may seem, especially when we want to display the local currency symbol instead of its code.
The base classes that handle currencies are `java.util.Currency` and` java.util.Locale`. In order to display the name, symbol, and code of each available currency, our first approach to this problem could look like this:

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

Starting with a very convenient method `Currency.getAvailableCurrencies()`, we can get all currencies provided by the JRE. Then we display each one according to the defined format. Unfortunately, in many cases we will not get the expected symbols:

```plaintext
...
Display name: Norwegian Krone, symbol: NOK, code: NOK, numericCode: 578
Display name: Indonesian Rupiah, symbol: IDR, code: IDR, numericCode: 360
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: PHP, code: PHP, numericCode: 608
...
```

For NOK, the local symbol would be "kr", for rupias "Rp", etc. This result is of course valid according to the documentation:
> Gets the symbol of this currency for the default DISPLAY locale.  
> For example, for the US Dollar, the symbol is "$" if the default locale is the US, while for other locales it may be "US$".  
> If no symbol can be determined, the ISO 4217 currency code is returned.

## Local currency symbols

To get the symbol we want, we need to use an overloaded method – `public String getSymbol(Locale locale)`. Moreover, it is not enough to pass any *Locale* here, as we will likely get a similar result. If we want to display the local currency symbol of a given country, we must pass the *Locale* of the same country. Such a relationship *Locale* – *Currency*, can be created with the following code:

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

In this case, we will retrieve a list of all Locals supported by the JRE from the `Locale.getAvailableLocales()` method. However, this list also includes locales that are not supported by the `Currency.getInstance()` method – in such case, an *IllegalArgumentException* will be thrown. Examples include locales that define only the language, without the specific country code:

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: English (Europe), en_150; country code: 150 is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

After linking locales to currencies, all we need to do is adjust our formatting:

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

And the final code will look like this:

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

In order to map the stream values, as parameters of the *collect* method, we must provide the manually constructed values of the *supplier*, *accumulator* and *combiner*. We cannot use `java.util.stream.Collectors.toMap()` here, since this collector does not support *null* values that are expected in our case.

Finally, the expected currency symbols should appear in our console:

```plaintext
...
Display name: norske kroner, symbol: kr, code: NOK, numericCode: 578
Display name: Rupiah Indonesia, symbol: Rp, code: IDR, numericCode: 360
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: ₱, code: PHP, numericCode: 608
...
```

And after optional deduplication, in a sample application:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-currency.png" alt="Screenshot of a window displaying a currency symbol choice" title="NutrieVal – selection of a preferred currency">
</a>
</figure>

## CVE – Cape Verdean escudo

It seems that only one currency – [Cape Verdean escudo](https://en.wikipedia.org/wiki/Cape_Verdean_escudo) – does not display the correct symbol. Instead of the so-called [cifrão](https://en.wikipedia.org/wiki/Cifr%C3%A3o) (no Unicode equivalent) or "Esc", an empty text is displayed. Actually, two characters are returned, based on the ASCII code table – a *vertical tab* followed by a *horizontal space*:

<img src="/img/hq/java-cve-escudo.png" alt="Zrzut ekranu z debugera" title="Zrzut ekranu z debugera">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)