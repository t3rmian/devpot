---
title: How to override or merge CSS schema properties of an OWASP Java HTML Sanitizer
url: owasp-java-html-sanitizer-style-override
id: 127
category:
  - java: Java
tags:
  - security
  - html
author: Damian Terlecki
date: 2024-04-07T20:00:00
---


The [`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer)
is probably one of the most mature solutions to protect against 3rd-party XSS HTML in Java.
It comes with basic prepackaged policies defined in the `org.owasp.html.Sanitizers` package
and more complex ones found under the `org.owasp.html.examples`.
You may also build your own one through `org.owasp.html.HtmlPolicyBuilder` with predefined or custom styles.

## Duplicate irreconcilable definitions for CSS style property

One of the OWASP Java HTML Sanitizer constraints is that you cannot override an already defined CSS style properties using public API.
Take `CssSchema.DEFAULT` as an example. It is implicitly used for a policy built with `allowStyling()` and it filters out all negative-margin properties:

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

> Samples are based on version `20240325.1`, although legacy versions preceding Guava's replacement with the Java collections framework, look similar.
> With this version also comes the `java8-shim` pack. It includes `org.owasp.shim.Java8Shim` utils providing adapters for Java 10 collection factories
> that you can use with Java 8.

Suppose you want to allow a negative `margin-top` property while reusing the default CSS schema at the same time.
You build your own schema just with this property, but combining it with the default one
using public API – `CssSchema.union()` or `PolicyFactory.and()` –
results in an `IllegalArgumentException`:

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

> For more samples on how to define a custom property do take a look at various predefined properties in the `CssSchema`.

## Overriding CssSchema

Much of the sanitizer implementation is final.
Fortunately, you can bypass this strict validation without having to copy and modify the whole schema definition.
Besides the concise public API, `CssSchema` exposes just enough package-private interfaces to write your own
extension under the same package.

Through the `CssSchema.allowedProperties()`, `CssSchema.forKey()`, and `CssSchema.withProperties()`
you can easily build an overridden schema. Coincidentally, you may also expose constants required for defining
property types, either as compile or runtime constants.

> A compile-time constant change in the library will require recompilation of your code.
> On the other hand, such change would be rather unlikely due to behavioral incompatibility for creating custom CSS properties.
> Treat it as a titbit about protecting against source/behavioral incompatibility when binary compatibility is preserved.  

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

With this knowledge, you may also implement other merging strategies.
Take a look at how it looks in action:


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

Contrary to the `CssSchema`, there doesn't seem to be any clean way to override selected `PolicyFactory` styles.
For example, to test the `EbayPolicyExample` with different styling, you would have to copy the whole definition and maintain it separately,
but at least without having to do the same for the implicit `CssSchema.DEFAULT`.

<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="OWASP Java HTML Sanitizer style override test results" title="OWASP Java HTML Sanitizer style override test results">

As with defining your own policies, be very careful.
Do consider the potentiality of [other impacts on the security](https://github.com/OWASP/java-html-sanitizer/pull/184).
Understand the interactions with white-listed properties and verify use in your contexts. 