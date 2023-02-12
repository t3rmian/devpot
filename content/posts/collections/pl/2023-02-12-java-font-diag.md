---
title: Weryfikacja czcionek kompatybilnych z danym językiem w Javie
url: java-font-diacritics-support
id: 104
category:
  - java: Java
tags:
  - jshell
  - czcionki
author: Damian Terlecki
date: 2023-02-12T20:00:00
---

Weryfikacja dostępnych czcionek może być niezbędna przy wdrożeniu aplikacji generującej tekst w postaci obrazu bądź w formacie PDF.
Standardowo, przy generowaniu tekstu możemy wybrać typ czcionki, tzw. *typeface* (np. serif, sans-serif, monospaced), bądź doprecyzować wybór
do konkretnej nazwy czcionki (np. Consolas). Jeśli nie mamy pod ręką edytora WYSIWYG korzystającego z tego samego środowiska i listy czcionek, to
nie możemy wykluczyć wystąpienia znaków zapytania w wygenerowanym tekście na docelowym środowisku.
Ważne jest więc aby czcionki były zdokeryzowane pod współdzielonym obrazem bazowym.

## Java, czcionki i AWT

W celu szybkiej weryfikacji dostępnych czcionek i ich wsparcia dla konkretnych znaków (np. znaków diakrytycznych) warto spojrzeć na AWT (Abstract Window Toolkit) API.
Interfejs z pakietu AWT, którego biblioteki w Javie używają do [ładowania czcionek](/pl/posty/ładowanie-czcionek-jre), pozwala nie tylko na wylistowanie czcionek.
Przydatną jego funkcją jest również możliwość zwrócenia informacji na temat tego, czy czcionka w pełni wspiera wyświetlanie poszczególnych znaków.

Do pozyskania środowiska graficznego, a następnie listy załadowanych czcionek wystarczy skorzystać z funkcji statyzcnej `GraphicsEnvironment.getLocalGraphicsEnvironment()`
i wywołać na niej metodę `getAllFonts()`. Czcionkę pozyskaną w ten sposób możemy następnie odpytać (`canDisplayUpTo()`) czy jest w stanie wyświetlić dany tekst.
Jeśli zwróci ona wartość -1 to znaczy, że w pełni wspiera wyświetlanie wszystkich podanych w parametrze znaków.

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

Powyższy program możesz skompilować przy użyciu narzędzia `javac` i uruchomić go podając tekst ze znakami do zweryfikowania `java FontDiag "abc"`.
W odpowiedzi wyświeli on wszystkie załadowane czcionki, a następnie tylko te, które są w stanie wyświetlić tekst w pełni, z podziałem na
nazwy i rodziny. Najprościej jednak wywołać program w powłoce `jshell`:

<img src="/img/hq/java-diacritics-support.svg" alt="Animacja przedstawiająca weryfikacja czcionek pozwalających na wyświetlenie znaków łacińskich i japońskich w dockerze" title="Weryfikacja czcionek pozwalających na wyświetlenie znaków łacińskich i japońskich w dockerze">
