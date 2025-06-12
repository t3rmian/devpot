---
title: Cómo obtener todos los símbolos de moneda en Java
url: java-simbolos-moneda-local
id: 46
category:
  - java: Java
tags:
  - jvm
author: Damian Terlecki
date: 2020-12-27T20:00:00
---

Mostrar monedas en Java no es tan sencillo como parece, especialmente si queremos mostrar el símbolo local en vez del código. Las clases base que gestionan las monedas son `java.util.Currency` y `java.util.Locale`. Para mostrar el nombre, símbolo y código de cada moneda disponible, nuestro primer intento podría verse así:

```java
class Scratch {

    public static final String CURRENCY_DISPLAY_FORMAT = "Display name: %s, symbol: %s, code: %s, numericCode: %s";

    private static String formatCurrency(Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(), currency.getSymbol(), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }

    public static void main(String[] args) {
        System.out.println("================ Monedas mostradas con Locale DISPLAY ================");
        System.out.println(Currency.getAvailableCurrencies()
                .stream()
                .map(Scratch::formatCurrency)
                .collect(Collectors.joining(System.lineSeparator()))
        );
    }

}
```

Usando el método `Currency.getAvailableCurrencies()`, obtenemos todas las monedas que provee el JRE. Luego mostramos cada una según el formato definido. Sin embargo, en muchos casos no obtendremos los símbolos esperados:

```plaintext
...
Display name: Norwegian Krone, symbol: NOK, code: NOK, numericCode: 578
Display name: Indonesian Rupiah, symbol: IDR, code: IDR, numericCode: 360
Display name: Polish Zloty, symbol: PLN, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: PHP, code: PHP, numericCode: 608
...
```

Para NOK, el símbolo local sería "kr", para rupias "Rp", etc. Este resultado es válido según la documentación:
> Obtiene el símbolo de esta moneda para el Locale DISPLAY predeterminado.  
> Por ejemplo, para el dólar estadounidense, el símbolo es "$" si el locale predeterminado es EE. UU., mientras que para otros locales puede ser "US$".  
> Si no se puede determinar el símbolo, se devuelve el código de moneda ISO 4217.

## Símbolos de moneda locales

Para obtener el símbolo que queremos, debemos usar el método sobrecargado – `public String getSymbol(Locale locale)`. Además, no basta con pasar cualquier *Locale*, ya que probablemente obtendremos un resultado similar. Si queremos mostrar el símbolo local de la moneda de un país, debemos pasar el *Locale* de ese país. Esta relación *Locale* – *Currency* se puede crear así:

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

En este caso, obtendremos una lista de todos los Locales soportados por el JRE con `Locale.getAvailableLocales()`. Sin embargo, esta lista también incluye locales que no son soportados por `Currency.getInstance()`, lo que lanzará una *IllegalArgumentException*. Ejemplos son locales que solo definen el idioma, sin un código de país específico:

```plaintext
...
For locale: Esperanto, eo; country code:  is not a supported ISO 3166 country code
For locale: English (Europe), en_150; country code: 150 is not a supported ISO 3166 country code
For locale: Urdu, ur; country code:  is not a supported ISO 3166 country code
...
```

Después de vincular locales a monedas, solo queda ajustar el formato:

```java
    private static String formatCurrency(Locale locale, Currency currency) {
        return String.format(CURRENCY_DISPLAY_FORMAT,
                currency.getDisplayName(locale), currency.getSymbol(locale), currency.getCurrencyCode(), currency.getNumericCodeAsString());
    }
```

Y el código final se verá así:

```java
    public static void main(String[] args) {
        System.out.println("================ Monedas mostradas con Locale local ================");
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

Para mapear los valores del stream, como parámetros del método *collect*, debemos proporcionar manualmente los valores de *supplier*, *accumulator* y *combiner*. No podemos usar `java.util.stream.Collectors.toMap()` aquí, ya que este collector no soporta valores *null*, que en nuestro caso son esperados.

Finalmente, los símbolos de moneda esperados deberían aparecer en la consola:

```plaintext
...
Display name: norske kroner, symbol: kr, code: NOK, numericCode: 578
Display name: Rupiah Indonesia, symbol: Rp, code: IDR, numericCode: 360
Display name: złoty polski, symbol: zł, code: PLN, numericCode: 985
Display name: Philippine Piso, symbol: ₱, code: PHP, numericCode: 608
...
```

Y tras una deduplicación opcional, en una aplicación de ejemplo:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/android-currency.png" alt="Captura de pantalla de una ventana mostrando la selección de símbolo de moneda" title="NutrieVal – selección de moneda preferida">
</a>
</figure>

## CVE – Escudo caboverdiano

Parece que solo una moneda – [escudo caboverdiano](https://es.wikipedia.org/wiki/Escudo_caboverdiano) – no muestra el símbolo correcto. En vez del llamado [cifrão](https://es.wikipedia.org/wiki/Cifr%C3%A3o) (sin equivalente Unicode) o "Esc", se muestra un texto vacío. De hecho, se devuelven dos caracteres, según la tabla ASCII: un *tabulador vertical* seguido de un *espacio horizontal*:

<img src="/img/hq/java-cve-escudo.png" alt="Captura de depurador" title="Captura de depurador">

> Display name: Skudu Kabuverdianu, symbol: ​, code: CVE, numericCode: 132  
> Display name: escudo cabo-verdiano, symbol: ​, code: CVE, numericCode: 132

> java -XshowSettings:properties -version  
> OpenJDK Runtime Environment (build 14.0.2+12-46)
