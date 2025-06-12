---
title: Javaフォントのダイアクリティカルマーク対応チェック
url: java-フォント-ダイアクリティカルマーク-サポート
id: 104
category:
- java: Java
tags:
- jshell
- フォント
author: Damian Terlecki
date: 2023-02-12T20:00:00
---

Javaアプリケーションで画像テキストやPDFを生成する際、サポートされているフォントを確認したいことがあります。
通常、テキストを生成する際には、書体（例：セリフ、サンセリフ、モノスペース）や特定のフォント名（例：Consolas）を選択できます。
同じ環境とフォントを共有するWYSIWYGエディタがない場合、ターゲット環境で生成されたテキストが疑問符だらけになってしまうかもしれません。
したがって、フォントが何らかの共有ベースイメージの下でDocker化されていることが重要です。

## Java AWTフォント

利用可能なフォントと、それらが特定の文字（例：ダイアクリティカルマーク）をサポートしているかを素早く確認するには、AWT（Abstract Window Toolkit）APIを見てみましょう。
Javaライブラリが[フォントをロードするために使用する](/posts/jre-font-loading)AWTパッケージインターフェースは、単なるフォントのリスト表示以上のことができます。
フォントが特定の文字の表示を完全にサポートしているかどうかも確認できます。

グラフィカル環境を取得し、次にロードされたフォントのリストを取得するには、静的関数
`GraphicsEnvironment.getLocalGraphicsEnvironment()`を使用し、返されたオブジェクトで`getAllFonts()`メソッドを呼び出します。
その後、フォントが特定のテキストを表示できるかどうかを（`canDisplayUpTo()`で）確認できます。-1の値を返した場合、
パラメータで指定されたすべての文字がこのフォントでサポートされています。

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

上記のプログラムは`javac`ツールでコンパイルし、検証する文字を含むテキストを指定して実行できます `java FontDiag "abc"`。
応答として、ロードされたすべてのフォントが表示され、最後に、テキストを完全に表示できるフォントのみが
名前とファミリーに分けて表示されます。しかし、最も簡単な実行方法は、このプログラムを`jshell`で呼び出すことです。

<img src="/img/hq/java-diacritics-support.svg" alt="Docker内でラテン文字と日本語を表示できるフォントの検証を示すアニメーション" title="Docker内でラテン文字と日本語を表示できるフォントの検証">

