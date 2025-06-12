---
title: Comprobación de soporte de diacríticos en fuentes Java
url: java-font-diacritics-support
id: 104
category:
  - java: Java
tags:
  - jshell
  - fonts
author: Damian Terlecki
date: 2023-02-12T20:00:00
---

Si tienes una aplicación Java que genera texto en imágenes o PDFs, a veces querrás verificar las fuentes soportadas.
Normalmente, al generar texto, puedes elegir el tipo de letra (por ejemplo, serif, sans-serif, monoespaciada) o un nombre de fuente específico (por ejemplo, Consolas). Si no tienes un editor WYSIWYG que comparta el mismo entorno y fuentes, puedes acabar con signos de interrogación en el texto generado en el entorno destino. Por eso es importante dockerizar las fuentes bajo una imagen base compartida.

## Fuentes Java AWT

Para una verificación rápida de fuentes disponibles y su soporte para caracteres específicos (por ejemplo, diacríticos), revisa la API de AWT (Abstract Window Toolkit).
Las interfaces del paquete AWT que las librerías Java [usan para cargar fuentes](/posts/jre-font-loading) pueden hacer más que listar fuentes.
También pueden verificar si la fuente soporta completamente ciertos caracteres.

Para obtener el entorno gráfico y la lista de fuentes cargadas, usa la función estática
`GraphicsEnvironment.getLocalGraphicsEnvironment()` y llama al método `getAllFonts()` sobre el objeto devuelto.
Luego podemos comprobar (`canDisplayUpTo()`) si la fuente puede mostrar un texto dado. Si devuelve -1,
todos los caracteres especificados están soportados por esa fuente.

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
            System.out.println("Uso: FontDiag.main(\"<tus_caracteres_de_fuente>\")");
            return;
        }
        String fontCharacters = args[0];
        System.out.printf("Verificando qué fuentes soportan los siguientes caracteres: %s%n%n", fontCharacters);
        GraphicsEnvironment environment = GraphicsEnvironment.getLocalGraphicsEnvironment();
        List<Font> fonts = Arrays.asList(environment.getAllFonts());
        fonts.sort(Comparator.comparing(Font::getFontName));
        List<Font> supportedFonts = new ArrayList<>();
        for (Font font : fonts) {
            if (font.canDisplayUpTo(fontCharacters) == -1) {
                supportedFonts.add(font);
            }
        }
        System.out.printf("Todas las fuentes: %s%n%n", fonts.stream().map(Font::getFontName).toList());
        System.out.printf("Fuentes soportadas: %s%n%n", supportedFonts.stream().map(Font::getFontName).toList());
        System.out.printf("Familias de fuentes soportadas: %s%n%n", supportedFonts.stream().map(Font::getFamily).collect(Collectors.toSet()));
    }
}
```

Puedes compilar el programa anterior con `javac` y ejecutarlo especificando el texto con los caracteres a verificar: `java FontDiag "abc"`.
Como respuesta, mostrará todas las fuentes cargadas y, al final, solo las que pueden mostrar el texto completo, desglosadas por nombre y familia. La forma más fácil de ejecutarlo es invocarlo en `jshell`:

<img src="/img/hq/java-diacritics-support.svg" alt="Animación mostrando la verificación de fuentes que pueden mostrar caracteres latinos y japoneses en Docker" title="Verificación de fuentes que pueden mostrar caracteres latinos y japoneses en Docker">
