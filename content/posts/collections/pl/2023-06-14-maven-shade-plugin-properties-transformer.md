---
title: Maven Shade Plugin i PropertiesTransformer na przykładach
url: maven-shade-plugin-properties-transformer
id: 112
category:
  - java: Java
tags:
  - maven
  - maven-shade-plugin
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

Maven Shade Plugin to wtyczka mavenowa, umożliwiająca łączenie zależności
podczas procesu budowania projektu. Głównym celem tego pluginu jest stworzenie jednego pliku JAR
zawierającego całą funkcjonalność aplikacji oraz jej zależności.

Często w trakcie tego procesu pojawia się problem z łączeniem plików konfiguracyjnych, takich jak np. `*.properties`.
Standardowo, ostatni napotkany plik jest umieszczany w wynikowym artefakcie, dlatego konfiguracja wtyczki umożliwia
zmianę tego zachowania za pomocą transformacji.

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='Konflikt zasobów przy użyciu Maven Shade Plugin' alt='Konflikt zasobów przy użyciu Maven Shade Plugin'>

## Transformacja *PropertiesTransformer*

Do użytku mamy kilka wbudowanych transformacji, a bardziej złożone zaimportujemy od zewnętrznych dostawców.
Od wersji 3.2.2 twórcy udostępnili również implementację `org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`,
której nazwa brzmi obiecująco. Szczególnie gdy potrzebujesz zmiany kolejności łączenia właściwości, aby aplikacja odczytała te, które powinny być preferowane.

W dokumentacji [*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)
znajdziesz przykładową konfigurację (poniżej). Jej wyjaśnienie wydaje się dosyć powierzchowne, dlatego zaprezentuję szczegółowe działanie na przykładach w oparciu o
[wersję 3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java).

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- required configuration -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- optional configuration -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

Mając dwa pliki `configuration/application.properties` kolejno z modułu A i modułu B:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
transformacja wtyczki *maven-shade-plugin* łącząca obie zależności wyprodukuje następujący plik `configuration/application.properties`:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***


### *ordinalKey* i *defaultOrdinal*


To, w jakiej kolejności zostaną złączone pliki, sterowane jest za pomocą klucza `ordinalKey` wskazującego na nazwę właściwości, której wartość to właśnie kolejność.
W przypadku gdy plik z właściwościami nie zawiera takiego klucza, jego kolejność definiowana jest za pomocą `defaultOrdinal` (w przypadku braku - 0).
Definiując kolejnośc wyższą niż standardowa w pliku modułu A:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
na wyjściu otrzymamy właściwość `prop2` z modułu A, czyli wynikowo w odwrotnej kolejności.
Dodatkowo klucz definiujący kolejność zostanie usunięty:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

Klucz `alreadyMergedKey` definiuje nazwę właściwości o wartości `boolean` (np. `true`), która wskazuje, że plik
jest priorytetowy i nie powinny być do niego dołączane inne właściwości:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
Dla powyższych właściwości otrzymamy kopię z modułu A, ponownie z usuniętym kluczem syntetycznym `already_merged`:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

Wystąpienie tego samego klucza o wartości `true` w dwóch plikach nie jest dozwolone i spowoduje błąd.

***


### *reverseOrder*

Do odwrócenia kolejności łączenia plików możemy skorzystać z opcji `reverseOrder`. Niestety funkcjonalność ta nie odwraca kolejności
pomiędzy plikami o tej samej wartości porządku. Tj. dla `<reverseOrder>true</reverseOrder>` i dwóch plików:
```properties
#module-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#module-b configuration/application.properties
prop2=C
prop3=D
```
nadal (bez względu na wartość `reverseOrder`) otrzymamy taki sam rezultat: 
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```
Odwrócenie zadziała dopiero po zdefiniowaniu porządku za pomocą `ordinalKey` i jedynie pomiędzy plikami o różnym porządku.

***

## Podsumowanie

Transformacja `PropertiesTransformer` pozwala na podstawowe łączenie plików z właściwościami.
Warto wiedzieć, że pliki są początkowo wczytywane pod postacią `java.util.Properties`.
Duplikaty są nadpisywane najnowszymi (najbliżej dołu) właściwościami w obrębie tego samego pliku.

W obrębie kilku plików możemy sterować kolejnością łączenie plików bądź wskazać plik priorytetowy poprzez dodanie sztucznego klucza.
Niestety kolejności nie odwrócimy pomiędzy plikami mającymi tę samą bądź standardową kolejność.

Jeśli więc potrzebujesz nieco innej funkcjonalności łączenia (np. bez konieczności ingerencji w pliki),
warto zainteresować się zewnętrznymi dodatkami do wtyczki. 
Zależność z dodatkowymi transformacjami dodasz bez problemu za pomocą tagu `<dependencies></dependencies>` wewnątrz `<plugin></plugin>`
Proste łączenie właściwości w odwrotnej kolejności znajdziesz, np. w 
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0).
