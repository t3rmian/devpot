---
title: Verificação de suporte a diacríticos em fontes Java
url: java-fontes-suporte-diacriticos
id: 104
category:
- java: Java
tags:
- jshell
- fontes
author: Damian Terlecki
date: 2023-02-12T20:00:00
---

Tendo uma aplicação Java que gera texto em imagens ou PDFs, às vezes você pode querer verificar as fontes suportadas.
Normalmente, ao gerar texto, você pode escolher o tipo de letra (por exemplo,
serif, sans-serif, monospaced) e/ou um nome de fonte específico (por exemplo, Consolas). Sem ter um
editor WYSIWYG que compartilhe o mesmo ambiente e fontes, você pode acabar com pontos de interrogação
no texto gerado no ambiente de destino. Portanto, é importante que as fontes sejam dockerizadas em alguma imagem base
compartilhada.

## Fontes AWT do Java

Para uma verificação rápida das fontes disponíveis e seu suporte para caracteres específicos (por exemplo, diacríticos), dê uma olhada na API AWT (Abstract Window Toolkit).
As interfaces do pacote AWT que as bibliotecas Java [usam para carregar fontes](/posts/jre-font-loading) podem fazer mais do que apenas listar as fontes.
Elas também podem verificar se a fonte suporta totalmente a exibição de alguns caracteres específicos.

Para obter o ambiente gráfico e, em seguida, a lista de fontes carregadas, use a função estática
`GraphicsEnvironment.getLocalGraphicsEnvironment()` e chame o método `getAllFonts()` no objeto retornado.
Podemos então verificar (`canDisplayUpTo()`) se a fonte é capaz de exibir um determinado texto. Se retornar o valor -1,
todos os caracteres especificados no parâmetro são suportados por esta fonte.

```java
import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

class FontDiag {
    public static void main(String... args) {
        if (args == null || args.length != 1) {
            System.out.println("Usage: FontDiag.main(\"<your_font_characters>\")");
            return;
        }
        String fontCharacters = args[0];
        System.out.printf("Verifying which fonts support the following characters: %s%n%n", fontCharacters);
        GraphicsEnvironment environment = GraphicsEnvironment.getLocalGraphicsEnvironment();
        List<Font> fonts = Arrays.asList(environment.getAllFonts());
        fonts.sort(Comparator.comparing(Font::getFontName));
        List<Font> supportedFonts = new ArrayList<>();
        for (Font font : fonts) {
            if (font.canDisplayUpTo(fontCharacters) == -1) {
                supportedFonts.add(font);
            }
        }
        System.out.printf("All fonts: %s%n%n", fonts.stream().map(Font::getFontName).toList());
        System.out.printf("Supported fonts: %s%n%n", supportedFonts.stream().map(Font::getFontName).toList());
        System.out.printf("Supported font families: %s%n%n", supportedFonts.stream().map(Font::getFamily).collect(Collectors.toSet()));
    }
}
```

Você pode compilar o programa acima usando a ferramenta `javac` e executá-lo especificando o texto com os caracteres a serem verificados `java FontDiag "abc"`.
Em resposta, ele exibirá todas as fontes carregadas e, por último, apenas aquelas que podem exibir o texto completamente, divididas em
nomes e famílias. A maneira mais fácil de executá-lo, no entanto, é invocar este programa no `jshell`:

<img src="/img/hq/java-diacritics-support.svg" alt="Animação mostrando a verificação de fontes que podem exibir caracteres latinos e japoneses dentro de um Docker" title="Verificação de fontes que podem exibir caracteres latinos e japoneses em um Docker">

