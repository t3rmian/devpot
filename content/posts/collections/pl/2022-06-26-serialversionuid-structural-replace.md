---
title: Strukturalne dodanie pola serialVersionUID w IntelliJ
url: quick-fix-serializable-serialversionuid
id: 89
category:
  - java: Java
tags:
  - intellij
  - wyszukiwanie strukturalne
author: Damian Terlecki
date: 2022-06-26T20:00:00
---

Zadeklarowanie pola `serialVersionUID` w klasie implementującej interfejs *Serializable* pozwala zapewnić lepszą kontrolę
nad kompatybilnością klas w Javie. O praktyce tej więcej poczytać możesz [tutaj](https://www.vojtechruzicka.com/explicitly-declare-serialversionuid).
W IntelliJ IDE przeglądając inspekcje kodu znajdziesz właśnie regułę "Serializable class without "serialVersionUID", którą możesz włączyć i zastosować szybką poprawkę (ALT+Enter na klasie).

Potrzeba nagłej zmiany wszystkich klas w celu dodania tego pola może okazać się dosyć męczącym zadaniem. Szybkiej poprawki
nie można zastosować zbiorczo (przynajmniej w obecnej wersji, czyli 222.3153.4). Patrząc na [implementację](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/plugins/InspectionGadgets/src/com/siyeh/ig/serialization/SerializableInnerClassHasSerialVersionUIDFieldVisitor.java), 
brakuje tutaj również wykorzystania standardowego interfejsu, który mógłby być użyty do automatycznego czyszczenia kodu przez IntelliJ.

## Wyszukiwanie strukturalne i podmiana


Istnieje jednak inna funkcjonalność w IntelliJ, której można użyć do szybkiego dodania brakującego pola w wybranych klasach. *Structural Search/Replace*
to mechanizm wyszukiwania i zastępowania części kodu zgodnie ze składnią wybranego języka wspieranego przez IDE. Funkcjonalność tę
wywołasz za pomocą szybkich akcji (CTRL+SHIFT+A) lub menu: Edit > Find > Replace Structurally.

<figure class="flex">
<img src="/img/hq/serialversionuid-search-and-replace-structurally.png" alt="IntelliJ Structural Search/Replace" title="IntelliJ Structural Search/Replace">
<img src="/img/hq/replace-structurally-intellij.png" alt="IntelliJ Replace Structurally" title="IntelliJ Replace Structurally">
</figure>

W pierwszej kolejności spójrz na kilka przykładów prezentowanych przez IntelliJ, aby zapoznać się z tą funkcjonalnością.
Chociaż samo wyszukiwanie strukturalne jest naprawdę użyteczne, to zastąpienie nie zawsze działa tak jakby chciał tego użytkownik.
Tworząc szablon z elementem interfejsu jak wyżej, szybko przekonasz się, że zastąpienie w klasach usunie interfejsy niezgodne z szablonem:

```java
// Przed
public class Foo extends AbstractClass implements IFooSerializable, IFoo {}
public class Bar extends AbstractClass implements Serializable, IFoo {}
// Po
public class Foo extends AbstractClass {}
public class Bar extends AbstractClass implements Serializable {}
```

Aby osiągnąć pożądane rezultaty, ogranicz kryteria wyszukiwania do samej klasy. W ten sposób interfejsy pozostaną
nienaruszone. Strukturalne wyszukiwanie i zamiana zapewnia dostęp do zaawansowanego
interfejsu IntelliJ, nie jest to jednak proste podejście. Jeszcze raz spójrz na [implementację](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/plugins/InspectionGadgets/src/com/siyeh/ig/serialization/SerializableInnerClassHasSerialVersionUIDFieldVisitor.java).
W skrypcie (Groovy) wyszukiwania klasy możesz zaimplementować tę samą logikę. Wszystko, co musisz wiedzieć, to to, że kontekstem wyszukiwania jest interfejs [*PsiClass*](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/java/java-psi-api/src/com/intellij/psi/PsiClass.java).

```groovy
!__context__.interface &&
        !__context__.enum &&
        !__context__.record &&
        __context__.qualifiedName != null &&
        __context__.isInheritor(com.intellij.psi.JavaPsiFacade.getInstance(__context__.project)
                .findClass(Serializable.class.getCanonicalName()), true)
```

Powyższa implementacja nie jest odwzorowana 1-do-1, ale całkiem dobrze sprawdza się w większości przypadków.
Zasługujący uwagi brak pola widoczny w szablonie definiujemy jako *RegEx* o liczbie wystąpień 0.
Taki szablon możesz zaimportować w oknie wyszukiwania i dalej ulepszyć go do swoich potrzeb:

```xml
<replaceConfiguration 
        name="Serializable without serialVersionUID"
        uuid="d5a3f346-c3cc-3aaf-9e4a-21b758444f0b"
        text="class $Class$ {&#10;    private static final long $Field$ = $Value$;&#10;}"
        recursive="false" type="JAVA" pattern_context="default"
        reformatAccordingToStyle="false" shortenFQN="false"
        replacement="class $Class$ {&#10;    private static final long serialVersionUID = 1L;&#10;}&#10;"
        case_sensitive="true">
  <constraint name="__context__" within="" contains="" />
  <constraint 
          name="Class"
          script="&quot;!__context__.interface &amp;&amp; !__context__.enum &amp;&amp; !__context__.record &amp;&amp; __context__.qualifiedName != null &amp;&amp; __context__.isInheritor(com.intellij.psi.JavaPsiFacade.getInstance(__context__.project).findClass(Serializable.class.getCanonicalName()), true)&quot;"
          target="true" within="" contains="" />
  <constraint name="Field" regexp="serialVersionUID" minCount="0"
              maxCount="0" within="" contains="" />
  <constraint name="Value" within="" contains="" />
</replaceConfiguration>
```

> **Uwaga:** Zastąpienie strukturalne powoduje również przeformatowanie kodu w całym pliku. Zachowanie to jest obecnie [zgłoszone](https://youtrack.jetbrains.com/issue/IDEA-167576/Structural-replace-introduces-static-imports) jako błąd. Warto pamiętać o tym przy podmianie starszego, niesformatowanego kodu.
