---
title: Jak wyświetlić symbole wszystkich walut w Javie
url: java-local-currency-symbols
id: 46
category:
- java: Java
tags:
  - jvm
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

Wyświetlenie walut w Javie nie jest tak proste, jak mogłoby się wydawać, szczególnie gdy chcemy wyświetlić lokalny symbol waluty, zamiast jego kodu.
Podstawowymi klasami wspomagającymi operowanie na walutach są `java.util.Currency` oraz `java.util.Locale`. Chcąc wyświetlić nazwę, symbol oraz kod każdej możliwej waluty, nasze pierwsze podejście do tego problemu może wyglądać następująco:

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

Zaczynając od bardzo wygodnej metody `Currency.getAvailableCurrencies()`, pobieramy wszystkie możliwe waluty i wyświetlamy szukane informacje zgodnie z przyjętym formatem. Niestety w większości przypadków nie otrzymamy oczekiwanych symboli:

```plaintext
...
Display name: Lithuanian Litas, symbol: LTL, code: LTL, numericCode: 440
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: US Dollar, symbol: $, code: USD, numericCode: 840
...
```

Wyświetlony został symbol PLN dla polskich złotych, a chcielibyśmy wyświetlić *zł*. Taki rezultat jest oczywiście zgodny z dokumentacją:
> Gets the symbol of this currency for the default DISPLAY locale.  
> For example, for the US Dollar, the symbol is "$" if the default locale is the US, while for other locales it may be "US$".  
> If no symbol can be determined, the ISO 4217 currency code is returned.

## Lokalny symbol waluty

Aby otrzymać oczekiwany symbol, musimy więc skorzystać z innej metody – `public String getSymbol(Locale locale)`. Dodatkowo, nie wystarczy tutaj podać dowolnego *Locale*, gdyż otrzymamy podobny rezultat. Jeśli chcemy wyświetlić symbol waluty danego kraju, to do metody musimy również przekazać *Locale* tego samego kraju. Takie powiązanie *Locale* – *Currency*, możemy stworzyć następująco:

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

W tym przypadku listę wszystkich Locale wspieranych przez JRE otrzymamy z metody `Locale.getAvailableLocales()`. Lista ta zawiera też takie *Locale*, które nie są wspierane przez metodę `Currency.getInstance()` – w takim przypadku wyrzucony zostanie wyjątek *IllegalArgumentException*. Do przykładów zaliczają się *Locale* wskazujące jedynie na język:

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: Polish, pl; country code:  is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

Po utworzeniu powiązań pomiędzy *Locale* i *Currency* wystarczy, że dostosujemy nasze formatowanie:

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

A końcowe wyświetlanie będzie wyglądało następująco:

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

W celu zmapowania wartości *Locale* -> *Currency*, jako parametry metody *collect* musimy podać własnoręcznie skonstruowane wartości parametrów *supplier*, *accumulator* i *combiner*. Nie możemy tutaj skorzystać z `java.util.stream.Collectors.toMap()`, gdyż kolektor ten nie wspiera wartości *null*, które są oczekiwane w naszym przypadku.

Ostatecznie w naszej konsoli powinny pojawić się oczekiwane symbole walut:

```plaintext
...
Display name: Náìrà ti Orílẹ̀-èdè Nàìjíríà, symbol: ₦, code: NGN, numericCode: 566
Display name: norgga kruvdno, symbol: kr, code: NOK, numericCode: 578
Display name: US Dollar, symbol: US$, code: USD, numericCode: 840
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
...
```

A tak w przykładowej aplikacji po opcjonalnej deduplikacji:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-waluta.png" alt="Zrzut ekranu z wyboru symbolu waluty" title="NutrieVal – wybór wyświetlanej waluty">
</a>
</figure>

## CVE – Escudo Zielonego Przylądka

Wygląda na to, że tylko jedna waluta – [Escudo Zielonego Przylądka](https://en.wikipedia.org/wiki/Cape_Verdean_escudo) – nie umożliwia wyświetlenie poprawnego symbolu. Zamiast tzw. [cifrão](https://pl.wikipedia.org/wiki/Cifr%C3%A3o) (brak odpowiednika w standardzie Unicode) lub "Esc" wyświetlany jest pusty tekst. Właściwie, zwracane są dwa znaki, na podstawie tabeli kodów ASCII – *vertical tab* i *horizontal space*:

<img src="/img/hq/java-cve-escudo.png" alt="Zrzut ekranu z debugera" title="Zrzut ekranu z debugera">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)