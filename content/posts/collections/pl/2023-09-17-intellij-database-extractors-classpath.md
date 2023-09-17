---
title: Biblioteki dołączane do ekstraktorów danych bazodanowych IntelliJ
url: intellij-database-extractor-api
id: 116
category:
  - other: Inne
tags:
  - classloading
  - intellij
author: Damian Terlecki
date: 2023-09-17T20:00:00
---

Funkcjonalność ekstrakcji danych bazodanowych w IntelliJ to bardzo rozszerzalna możliwość kopiowania
wybranych kolumn i wierszy rezultatu zapytania bazodanowego. Podstawowy interfejs opisany
[w dokumentacji](https://www.jetbrains.com/help/idea/data-extractors.html#api_for_custom_data_extractors)
pozwala na zdefiniowanie własnego ekstraktora przy użyciu języka Groovy bądź JavaScript.

IntelliJ dostarcza nam API w postaci zmiennych z opisanymi metodami pozwalającymi na dostęp do tabel i kolumn.
Za jego pomocą skonstruować możesz własny rezultat ekstrakcji.
Narzędzie to udostępnia jednak dużo więcej ukrytych i nieopisanych funkcji.

<figure class="flex">
<img src="/img/hq/intellij-data-extractors-directory.png" alt="Ekstraktory danych z zakładki Database w IntelliJ" title="Ekstraktory danych z zakładki Database w IntelliJ">
<img src="/img/hq/intellij-custom-data-extractor.png" alt="Folder ze zdefiniowanymi ekstraktorami danych w IntelliJ" title="Folder ze zdefiniowanymi ekstraktorami danych w IntelliJ">
</figure>

## Po nitce do kłębka – DbSqlUtil

Patrząc na dostarczone przez IntelliJ ekstraktory, znajdziemy odwołanie do
klasy `com.intellij.database.util.DbSqlUtil`.
Chcąc przykładowo dowiedzieć się, na jakiej zasadzie działa często używana metoda `areKeywordsLowerCase`,
szybko zauważymy, że nie jesteśmy w stanie podejrzeć jej implementacji (*CTRL + Shift + A > Go to implementation*).
Problem okazuje się bardziej globalny ze względu na to, że informacje o błędach dostajemy dopiero przy uruchomieniu. 

Biorąc pod uwagę to, że Groovy podlega temu samemu procesowi ładowania klas jak w przypadku Javy,
możemy w prosty sposób spróbować uzyskać informacje na temat wykorzystywanych klas.
Wystarczy, że wypiszemy informacje na temat hierarchii *ClassLoaderów*, które załadowały nasz skrypt Groovy.
Tworząc debugowy ekstraktor danych, wypiszmy ścieżkę classpath oraz załadowane biblioteki:

```groovy
def printClassPath(classLoader, depth) {
    OUT.append("${depth}. ${classLoader.class.name}: ")
            .append(String.valueOf(classLoader)
                    .replace(",", ",${System.lineSeparator()}")
                    .replace("(", "${System.lineSeparator()}(${System.lineSeparator()} ")
                    .replace(")", "${System.lineSeparator()})")
            )
            .append(System.lineSeparator())
    if (classLoader instanceof URLClassLoader) {
        classLoader.getURLs().each { url ->
            OUT.append("- ")
                    .append(String.valueOf(url))
                    .append(System.lineSeparator())
        }
    }
    if (classLoader.parent) {
        printClassPath(classLoader.parent, depth + 1)
    }
}

OUT.append("Classpath: ${System.getProperty("java.class.path")}${System.lineSeparator()}")
OUT.append("Top-down ClassLoader hierarchy:${System.lineSeparator()}")
printClassPath(this.class.classLoader, 1)
```

W wersji IntelliJ 2023.2.2 otrzymałem następujące dane, próbując ekstrakcji dowolnych danych rezultatu zapytania:

```shell
Classpath: ...
Top-down ClassLoader hierarchy:
1. groovy.lang.GroovyClassLoader$InnerLoader: groovy.lang.GroovyClassLoader$InnerLoader@7e3f7bbe
2. groovy.lang.GroovyClassLoader: groovy.lang.GroovyClassLoader@3176bcb3
3. com.intellij.database.extensions.ExtensionScriptsUtil$1: com.intellij.database.extensions.ExtensionScriptsUtil$1@7accdcc1
4. com.intellij.ide.plugins.cl.PluginClassLoader: PluginClassLoader
(
 plugin=PluginDescriptor
(
 name=Database Tools and SQL,
 id=com.intellij.database,
 descriptorPath=plugin.xml,
 path=~/Library/Application Support/JetBrains/Toolbox/apps/IDEA-U/ch-0/232.9921.47/IntelliJ IDEA.app/Contents/plugins/DatabaseTools,
 version=232.9921.47,
 package=null,
 isBundled=true
),
 packagePrefix=null,
 state=active
)
```

Najciekawszą pozycją jest tutaj *PluginClassLoader*, który wygląda, jakby ładował biblioteki ze ścieżki `Contents/plugins/DatabaseTools` relatywnie do lokacji zainstalowanego IDE.
Dodając w kolejnym kroku biblioteki z tego modułu do projektu w IntelliJ (*File > Project Structure > Platform Settings > Global Libraries*),
możemy w końcu podejrzeć (zdekompilowany) kod użytej klasy i wydedukować jej działanie.

<figure class="flex">
<img loading="lazy" src="/img/hq/intellij-global-library.png" alt="Globalna biblioteka projektu IntelliJ" title="Globalna biblioteka projektu IntelliJ">
<img loading="lazy" src="/img/hq/intellij-database-plugin.png" alt="Klasy biblioteki w drzewku projektu IntelliJ" title="Klasy biblioteki w drzewku projektu IntelliJ">
</figure>

Tym samym sposobem możesz przejrzeć też inne klasy użytkowe w sąsiednich pakietach mając jednak na uwadze to,
że mogą się one zmieniać wraz z aktualizacją IDE.
W przypadku wspomnianej metody `areKeywordsLowerCase` z kodu wynika, że chodzi tu o ustawienie
projektowe edytora IntelliJ w sekcji *Code Style* dla języka SQL (*General > Word Case > Keywords*)  