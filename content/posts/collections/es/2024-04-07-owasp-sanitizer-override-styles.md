---
title: Cómo sobrescribir o fusionar propiedades CSS en un esquema de OWASP Java HTML Sanitizer
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

El [`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer) es probablemente una de las soluciones más maduras para proteger contra XSS de terceros en Java. Viene con políticas preempaquetadas básicas en el paquete `org.owasp.html.Sanitizers` y otras más complejas en `org.owasp.html.examples`. También puedes crear la tuya propia con `org.owasp.html.HtmlPolicyBuilder` usando estilos predefinidos o personalizados.

## Definiciones duplicadas irreconciliables para propiedades CSS

Una de las limitaciones del OWASP Java HTML Sanitizer es que no puedes sobrescribir propiedades CSS ya definidas usando la API pública. Por ejemplo, `CssSchema.DEFAULT` se usa implícitamente con `allowStyling()` y filtra todas las propiedades de margen negativo:

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

> Los ejemplos están basados en la versión `20240325.1`, aunque las versiones anteriores (antes de reemplazar Guava por colecciones Java) son similares.  
> Con esta versión también viene el paquete `java8-shim`, que incluye utilidades como `org.owasp.shim.Java8Shim` para adaptar las factorías de colecciones de Java 10 y usarlas en Java 8.

Supón que quieres permitir un `margin-top` negativo reutilizando el esquema CSS por defecto. Si construyes tu propio esquema solo con esa propiedad y lo combinas con el por defecto usando la API pública – `CssSchema.union()` o `PolicyFactory.and()` – obtendrás un `IllegalArgumentException`:

```java
//...
public class SanitizerTest {
    //...
    private final static CssSchema.Property NEGATIVE_MARGIN_TOP_PROPERTY =
            new CssSchema.Property(
                    CssSchemaUtils.BIT_QUANTITY | CssSchemaUtils.BIT_NEGATIVE, // tipos de valor permitidos
                    Set.of("auto", "inherit"), // literales permitidos
                    Map.of() // funciones CSS
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

> Para más ejemplos de cómo definir una propiedad personalizada, revisa las propiedades predefinidas en `CssSchema`.

## Sobrescribiendo CssSchema

Gran parte de la implementación del sanitizer es final. Por suerte, puedes saltarte esta validación estricta sin copiar y modificar todo el esquema. Además de la API pública, `CssSchema` expone interfaces package-private suficientes para escribir tu propia extensión bajo el mismo paquete.

Con `CssSchema.allowedProperties()`, `CssSchema.forKey()` y `CssSchema.withProperties()` puedes construir fácilmente un esquema sobrescrito. De paso, puedes exponer constantes necesarias para definir tipos de propiedad, ya sea como constantes de compilación o de runtime.

> Si cambian las constantes en la librería, tendrás que recompilar tu código.  
> De todos modos, es poco probable porque rompería la compatibilidad de comportamiento para propiedades CSS personalizadas.  
> Tómalo como curiosidad sobre cómo protegerse ante incompatibilidades de fuente/comportamiento cuando la compatibilidad binaria se mantiene.

```java
package org.owasp.html;

import java.lang.invoke.MethodHandles;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public class CssSchemaUtils {

    public static final int BIT_QUANTITY = CssSchema.BIT_QUANTITY; // constante de compilación
    public static final int BIT_NEGATIVE;

    static {
        try { // o constante de runtime
            BIT_NEGATIVE = (int) MethodHandles.lookup().in(CssSchema.class)
                    .findStaticVarHandle(CssSchema.class, "BIT_NEGATIVE", int.class)
                    .get();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    /* otras constantes BIT_.. */

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

Con esto, puedes implementar otras estrategias de fusión. Así se ve en acción:

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

A diferencia de `CssSchema`, no parece haber una forma limpia de sobrescribir estilos seleccionados en un `PolicyFactory`. Por ejemplo, para probar `EbayPolicyExample` con otro estilo, tendrías que copiar toda la definición y mantenerla aparte, aunque al menos sin duplicar el `CssSchema.DEFAULT`.

<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="OWASP Java HTML Sanitizer style override test results" title="OWASP Java HTML Sanitizer style override test results">

Como al definir tus propias políticas, ten mucho cuidado. Considera el [impacto en la seguridad](https://github.com/OWASP/java-html-sanitizer/pull/184). Entiende las interacciones con las propiedades permitidas y verifica el uso en tu contexto.
