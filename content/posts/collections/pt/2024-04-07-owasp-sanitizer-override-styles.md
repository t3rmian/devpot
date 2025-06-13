---
title: Como sobrescrever ou mesclar propriedades de esquema CSS de um Sanitizador HTML Java da OWASP
url: como-sobrescrever-estilo-sanitizador-html-java-owasp
id: 127
category:
- java: Java
tags:
- seguranca
- html
author: Damian Terlecki
date: 2024-04-07T20:00:00
---


O [`owasp-java-html-sanitizer`](https://github.com/OWASP/java-html-sanitizer)
é provavelmente uma das soluções mais maduras para proteção contra XSS em HTML de terceiros em Java.
Ele vem com políticas básicas pré-empacotadas definidas no pacote `org.owasp.html.Sanitizers` e outras mais complexas encontradas em `org.owasp.html.examples`.
Você também pode construir a sua própria através do `org.owasp.html.HtmlPolicyBuilder` com estilos predefinidos ou personalizados.

## Definições duplicadas e irreconciliáveis para a propriedade de estilo CSS

Uma das restrições do Sanitizador HTML Java da OWASP é que você não pode sobrescrever propriedades de estilo CSS já definidas usando a API pública.
Veja o `CssSchema.DEFAULT` como exemplo. Ele é usado implicitamente para uma política construída com `allowStyling()` e filtra todas as propriedades de margem negativa:

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

> Os exemplos são baseados na versão `20240325.1`, embora versões legadas anteriores à substituição do Guava pelo framework de coleções do Java sejam semelhantes.
> Esta versão também traz o pacote `java8-shim`. Ele inclui os utilitários `org.owasp.shim.Java8Shim` que fornecem adaptadores para as fábricas de coleções do Java 10 que você pode usar com o Java 8.

Suponha que você queira permitir uma propriedade `margin-top` negativa e, ao mesmo tempo, reutilizar o esquema CSS padrão.
Você constrói seu próprio esquema apenas com essa propriedade, mas combiná-lo com o padrão
usando a API pública – `CssSchema.union()` ou `PolicyFactory.and()` –
resulta em uma `IllegalArgumentException`:

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

> Para mais exemplos sobre como definir uma propriedade personalizada, dê uma olhada nas várias propriedades predefinidas no `CssSchema`.

## Sobrescrevendo o CssSchema

Grande parte da implementação do sanitizador é final.
Felizmente, você pode contornar essa validação estrita sem ter que copiar e modificar toda a definição do esquema.
Além da API pública concisa, o `CssSchema` expõe interfaces `package-private` suficientes para que você escreva sua própria
extensão sob o mesmo pacote.

Através de `CssSchema.allowedProperties()`, `CssSchema.forKey()` e `CssSchema.withProperties()`,
você pode facilmente construir um esquema sobrescrito. Coincidentemente, você também pode expor as constantes necessárias para definir
os tipos de propriedade, seja como constantes de compilação ou de tempo de execução.

> Uma mudança em uma constante de tempo de compilação na biblioteca exigirá a recompilação do seu código.
> Por outro lado, tal mudança seria bastante improvável devido à incompatibilidade de comportamento para a criação de propriedades CSS personalizadas.
> Trate isso como uma curiosidade sobre como se proteger contra incompatibilidade de fonte/comportamento quando a compatibilidade binária é preservada.

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

Com este conhecimento, você também pode implementar outras estratégias de mesclagem.
Dê uma olhada em como isso funciona na prática:


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

Ao contrário do `CssSchema`, não parece haver uma maneira limpa de sobrescrever estilos selecionados do `PolicyFactory`.
Por exemplo, para testar o `EbayPolicyExample` com um estilo diferente, você teria que copiar toda a definição e mantê-la separadamente,
mas pelo menos sem ter que fazer o mesmo para o `CssSchema.DEFAULT` implícito.

<img src="/img/hq/owasp-java-html-sanitizer-style-override-tests.png" alt="Resultados do teste de sobrescrita de estilo do Sanitizador HTML Java da OWASP" title="Resultados do teste de sobrescrita de estilo do Sanitizador HTML Java da OWASP">

Assim como na definição de suas próprias políticas, seja muito cuidadoso.
Considere a possibilidade de [outros impactos na segurança](https://github.com/OWASP/java-html-sanitizer/pull/184).
Entenda as interações com as propriedades na lista de permissões e verifique o uso em seus contextos.
