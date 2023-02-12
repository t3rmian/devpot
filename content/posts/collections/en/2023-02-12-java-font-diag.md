---
title: Java font diacritics support check
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

Having a Java application that generates image text or PDFs, you may sometimes want to verify the supported fonts.
Usually, when generating text, you can choose the typeface (e.g.,
serif, sans-serif, monospaced) or/and a specific font name (e.g., Consolas). Not having a
WYSIWYG editor that shares the same environment and fonts, you may end up with question marks
in the generated text on the target environment. Thus, It's important for the fonts to be dockerized under some shared base
image.

## Java AWT Fonts

For a quick verification of available fonts and their support for specific characters (e.g. diacritics), take a look at the AWT (Abstract Window Toolkit) API.
The AWT package interfaces that the Java libraries [use to load fonts](/posts/jre-font-loading) can do more than just the font listing.
It can also verify whether the font fully supports the display of some specific characters.

To get the graphical environment and then the list of loaded fonts, use the static function
`GraphicsEnvironment.getLocalGraphicsEnvironment()` and call the `getAllFonts()` method on the returned object.
We can then check (`canDisplayUpTo()`) whether the font is able to display some given text. If it returns the value of -1,
all characters specified in the parameter are supported by this font.

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

You can compile the above program using the `javac` tool and run it by specifying the text with the characters to be verified `java FontDiag "abc"`.
In response, it will display all loaded fonts and lastly, only those that can display the text fully, broken down into
names and families. The easiest way to run it, however, is to invoke this program in the `jshell`:

<img src="/img/hq/java-diacritics-support.svg" alt="Animation showing the verification of fonts that can display Latin and Japanese characters inside a Docker" title="Verification of fonts that can display Latin and Japanese characters in a Docker">
