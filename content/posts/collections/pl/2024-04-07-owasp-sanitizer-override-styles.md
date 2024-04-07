---
title: Jak nadpisać lub scalić właściwości schematu CSS narzędzia OWASP Java HTML Sanitizer
url: owasp-java-html-sanitizer-nadpisywanie-stylów
id: 127
category:
  - java: Java
tags:
  - bezpieczeństwo
  - html
author: Damian Terlecki
date: 2024-04-07T20:00:00
---

Biblioteka [`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer) to prawdopodobnie jedno z najbardziej
dojrzałych rozwiązań w kontekście języka Java służących do ochrony przed XSS-em w niezaufanym HTML-u. Narzędzie to zawiera proste
predefiniowane zasady w pakiecie `org.owasp.html.Sanitizers` oraz bardziej złożone definicje w
pakiecie `org.owasp.html.examples`. Pozwala również na budowę własnych reguł za pomocą `org.owasp.html.HtmlPolicyBuilder`
z możliwością użycia predefiniowanych lub niestandardowych ograniczeń właściwości stylów CSS.

## Problem z nadpisywanie reguł styli CSS

Jednym z ograniczeń OWASP Java HTML Sanitizer jest brak interfejsu pozwalającego na nadpisanie wcześniej zdefiniowanych właściwości stylu CSS.
Weźmy jako przykład podstawowy schemat `CssSchema.DEFAULT`. Jest on używany domyślnie dla polityki
zbudowanej z użyciem metody `allowStyling()`. Schemat ten standardowo nie przepuszcza negatywnych wartości marginesu:

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

> Przykłady są oparte na wersji `20240325.1`, jednak również starsze wersje poprzedzające zastąpienie Guavy standardowymi kolekcjami Javy
> wyglądają podobnie. Wraz z tą wersją dostarczany jest dodatkowo pakiet `java8-shim`. Zawiera on
> zbiór prostych narzędzi `org.owasp.shim.Java8Shim` dostarczający adaptery dla fabryk kolekcji Javy 10, z których możesz skorzystać w Javie 8.

Załóżmy, że chcemy dodać możliwość dodania negatywnego marginesu `margin-top`, jednocześnie zachować dotychczasowe standardowe reguły CSS.
Po stworzeniu nowego schematu z tą właściwością próba połączenia go za pomocą publicznego interfejsu
API – `CssSchema.union()` lub `PolicyFactory.and()` – skutkuje błędem *IllegalArgumentException: Duplicate irreconcilable definitions for CSS style property for margin-top*:

```java
//...
public class SanitizerTest {
    //...
    private final static CssSchema.Property NEGATIVE_MARGIN_TOP_PROPERTY =
            new CssSchema.Property(
                    CssSchemaUtils.BIT_QUANTITY | CssSchemaUtils.BIT_NEGATIVE, // dozwolone typy wartości (stałe oryginalnie zdefiniowane w CssSchema)
                    Set.of("auto", "inherit"), // dozwolone literały
                    Map.of() // mapa dozwolonych tokenów funkcji CSS np. "rgb(" wskazująca na nazwę wcześniej dodanej właściwości np. "rgb()" definiującej dozwolone argumenty funkcji 
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

> Aby poznać więcej przykładów definiowania niestandardowej właściwości, rzuć okiem na sposób, w jaki zostały utworzone predefiniowane właściwości w klasie `CssSchema`.

## Nadpisywanie CssSchema

Większa część implementacji sanityzera jest finalna i nie można jej odziedziczyć.
Restrykcyjną walidację można na szczęście ominąć bez konieczności kopiowania i modyfikacji całej definicji schematu CSS.
Oprócz ograniczonego publicznego interfejsu API, `CssSchema` udostępnia
interfejs pakietowo-prywatny. Jest on w zupełności wystarczający aby napisać własne rozszerzenie pod warunkiem umieszczenia go w tym samym pakiecie.

Za pomocą metod `CssSchema.allowedProperties()`, `CssSchema.forKey()` i `CssSchema.withProperties()` można łatwo zbudować przesłonięty schemat.
Przy okazji możesz także upublicznić stałe wymagane do definiowania typów właściwości, poprzez zależność w fazie kompilacji bądź uruchomienia.

> Zmiana stałej w bibliotece zdefiniowanej w fazie kompilacji będzie wymagała rekompilację kodu zależnego.
> Z drugiej strony, taka zmiana byłaby raczej mało prawdopodobna z powodu niekompatybilności behawioralnej kodu użytego do tworzenia niestandardowych właściwości CSS.
> Potraktuj więc to jako ciekawostkę w kontekście ochrony przed niekompatybilnością kodu/zachowania potencjalnie nowej wersji, w przypadku gdy zachowana jest zgodność binarna.

```java
package org.owasp.html;

import java.lang.invoke.MethodHandles;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public class CssSchemaUtils {

    public static final int BIT_QUANTITY = CssSchema.BIT_QUANTITY; // stała zdefiniowana podczas kompilacji
    public static final int BIT_NEGATIVE;

    static {
        try { // stała zdefiniowana w fazie uruchomieniowej
            BIT_NEGATIVE = (int) MethodHandles.lookup().in(CssSchema.class)
                    .findStaticVarHandle(CssSchema.class, "BIT_NEGATIVE", int.class)
                    .get();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    /* pozostałe definicje stałych BIT_.. */

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

Z tą wiedzą możesz również zaimplementować inne strategie scalania.
Dzięki temu nadpisaniu sanityzacja kodu HTML przepuści tym razem również margines negatywny:


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

W przeciwieństwie do `CssSchema` obecnie nie ma czystego sposobu na przesłonięcie wybranych stylów zawartych w zbudowanej już fabryce `PolicyFactory`.
Na przykład, aby przetestować `EbayPolicyExample` z nieco zmodyfikowanymi regułami dotyczącymi stylów, konieczne jest skopiowanie całej definicji i utrzymywanie jej
osobno, ale przynajmniej bez konieczności robienia tego samego dla domyślnego `CssSchema.DEFAULT`.


<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="Wyniki testów nadpisania stylu javowego sanityzera HTML OWASP" title="Wyniki testów nadpisania stylu javowego sanityzera HTML OWASP">

Podobnie jak w przypadku definiowania własnych zasad, wskazana jest ostrożność i skupienie. Warto rozważyć różne
[inne potencjalne skutki dla bezpieczeństwa](https://github.com/OWASP/java-html-sanitizer/pull/184).
Możliwość łączenia z innymi dozwolonymi właściwościami wymaga weryfikacji ich użycia w różnych możliwych kontekstach.
