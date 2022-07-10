---
title: Dodanie brakującego pola serialVersionUID przy użyciu Error Prone
url: error-prone-fix-serializable-missing-serialversionuid
id: 90
category:
  - java: Java
tags:
  - jvm
  - wyszukiwanie strukturalne
  - maven
  - errorprone
author: Damian Terlecki
date: 2022-07-10T20:00:00
---

W [poprzednim artykule](quick-fix-serializable-serialversionuid) pokazałem, jak przy użyciu IntelliJ zastosować poprawkę brakującego pola `serialVersionUID` we wszystkich
implementacjach interfejsu *Serializable*. Sprawdźmy teraz, jak zaimplementować tę samą operację za pomocą [Error Prone](https://errorprone.info/),
narzędzia do analizy statycznej, którego możesz użyć podczas procesu kompilacji kodu Java.

Standardowo Error Prone dostarcza [zestaw wzorców błędów](https://errorprone.info/bugpatterns), które możesz weryfikować w procesie kompilacji kodu.
Wersjonowana serializacja niestety nie należy do tego zestawu, ale narzędzie zapewnia interfejs
do implementacji własnych wzorców. Co więcej, możesz także zaimplementować automatyczne poprawki do tak wykrytego wzorca błędu.
Dodanie własnego sprawdzenia to jednocześnie świetny sposób, aby dowiedzieć się, jak działa Error Prone i zastanowić się jak polepszyć jakość dostarczanego kodu.

## Instalacja Error Prone

Instalacja Error Prone będzie zależeć głównie od tego, jakich narzędzi do kompilacji używasz w swoim projekcie.
Pokażę ci konfigurację dla Mavena i jednej z nowszych wersji JDK (18), ponieważ jest ona nieco zagmatwane ze względu na
silną wewnętrzną enkapsulację JDK wprowadzoną w wersji 16. Kroki instalacyjne znajdziesz na stronie narzędzia, natomiast konfiguracja
własnych wzorców jest nieco trudniejsza.

Instalacja dla Mavena polega na dodaniu ścieżki procesora adnotacji Error Prone do wtyczki odpowiedzialnej za kompilację:

```xml
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.10.1</version>
        <configuration>
          <source>8</source>
          <target>8</target>
          <encoding>UTF-8</encoding>
          <compilerArgs>
            <arg>-XDcompilePolicy=simple</arg>
            <arg>-Xplugin:ErrorProne</arg>
          </compilerArgs>
          <annotationProcessorPaths>
            <path>
              <groupId>com.google.errorprone</groupId>
              <artifactId>error_prone_core</artifactId>
              <version>${error-prone.version}</version>
            </path>
            <!-- Other annotation processors go here.

            If 'annotationProcessorPaths' is set, processors will no longer be
            discovered on the regular -classpath; see also 'Using Error Prone
            together with other annotation processors' below. -->
          </annotationProcessorPaths>
        </configuration>
      </plugin>
    </plugins>
  </build>
```

W przypadku wersji JDK 16 i nowszych powyższy krok jest niewystarczający. Podczas kompilacji spodziewaj się poniższego błędu:

```java
java.lang.IllegalAccessError: class com.google.errorprone.BaseErrorProneJavaCompiler (in unnamed module @0x57c6feea) cannot access class com.sun.tools.javac.api.BasicJavacTask (in module jdk.compiler) because module jdk.compiler does not export com.sun.tools.javac.api to unnamed module @0x57c6feea
```

Problem rozwiązać możesz, dodając plik `.mvn/jvm.config` w katalogu głównym projektu mavenowego z następującą zawartością:
```java
--add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
--add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
--add-opens jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
--add-opens jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED
```

Te opcje umożliwią dostęp Error Prone do wewnętrznych interfejsów zdefiniowanych w JDK podczas procesu kompilacji rozpoczętego z poziomu Mavena.

## Własne wzorce błędów

Następnym krokiem jest dodanie własnej logiki do procesu kompilacji.
Po pierwsze, będziesz musiał skonfigurować oddzielny moduł, do którego dodasz wzorce.
Po zaimplementowaniu weryfikacji błędów skompilujesz dodane wzorce, które następnie zostaną użyte przy kompilacji głównego kodu.

### Konfiguracja Mavena

Własne wzorce dodasz do przedstawionej wcześniej konfiguracji kompilatora w module z głównym kodem.
W ramach ścieżek procesora adnotacji dodałem niestandardowy artefakt `dev.termian.processor:0.0.1-SNAPSHOT`, który za chwilę skonfiguruję i zaimplementuję.

```xml
<annotationProcessorPaths>
    <path>
        <groupId>com.google.errorprone</groupId>
        <artifactId>error_prone_core</artifactId>
        <version>2.14.0</version>
    </path>
    <path>
        <groupId>dev.termian</groupId>
        <artifactId>processor</artifactId>
        <version>0.0.1-SNAPSHOT</version>
    </path>
</annotationProcessorPaths>
```

We własnym projekcie możesz podzielić bazę kodu na dwa moduły, jeden z kodem, a drugi ze wzorcami kompilacji (*processor*).
Alternatywnie możesz stworzyć osobny projekt tylko dla wzorców, ale będziesz musiał poradzić sobie z kolejnością kompilacji bez pomocy Mavena.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <packaging>pom</packaging>
    <modules>
        <module>processor</module>
        <module>code</module>
    </modules>
    <!--...-->
</project>
```

W module procesora potrzebować będziesz zależności dla:
- *API Error Prone Check*, aby uzyskać dostęp do interfejsów wzorców;
- *Google auto-service* do automatycznego wykrywania i ładowania implementowanych wzorców;
- *Error Prone Test Helpers* w celu testowania walidacji wzorców kompilacji, a także weryfikacji poprawek kodu źródłowego.

```xml
<dependencies>
    <dependency>
        <groupId>com.google.errorprone</groupId>
        <artifactId>error_prone_check_api</artifactId>
        <version>2.14.0</version>
        <scope>compile</scope>
    </dependency>
    <dependency>
        <groupId>com.google.auto.service</groupId>
        <artifactId>auto-service</artifactId>
        <version>1.0.1</version>
        <scope>compile</scope>
    </dependency>

    <dependency>
        <groupId>com.google.errorprone</groupId>
        <artifactId>error_prone_test_helpers</artifactId>
        <version>2.14.0</version>
        <scope>test</scope>
    </dependency>
</dependencies>
```

Do testów jednostkowych sugeruję dodanie zależności JUnit, ale wybór frameworka
testowego pozostawiam do Twojego wyboru. Pamiętaj, że podczas uruchamiania testów konieczny będzie dostęp do wewnętrznego API JDK.
Dzięki wtyczce Maven Surefire możesz ponownie poluzować enkapsulację wewnętrznych elementów
środowiska wykonawczego Java podczas testów, podając odpowiednie argumenty JVM:

```xml

<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <version>3.10.1</version>
            <configuration>
                <source>18</source>
                <target>18</target>
                <compilerArgs>
                    <arg>--add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
                        --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
                        --add-opens jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
                        --add-opens jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED</arg>
                </compilerArgs>
            </configuration>
        </plugin>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-surefire-plugin</artifactId>
            <version>3.0.0-M5</version>
            <configuration>
                <argLine>--add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
                    --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
                    --add-opens jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
                    --add-opens jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED</argLine>
            </configuration>
        </plugin>
    </plugins>
</build>
```

Zauważ, że powtórzyłem argumenty również we wtyczce kompilatora. Bez tego konfiguracja zdefiniowana w `.mvn/jvm.config` niestety
nie była dodawana podczas kompilacji testów z poziomu IntelliJ mimo włączenia opcji "Delegate IDE build/run actions to Maven".

### Implementacja wzorców

Teraz gdy masz już skonfigurowany moduł do weryfikacji własnych błędów w fazie kompilacji, możesz przejrzeć [samouczek dotyczący implementacji wzorców](https://github.com/google/error-prone/wiki/Writing-a-check).
W naszym przypadku chcemy napisać poprawkę/sprawdzenie braku pola `serialVersionUID`. Samouczek jest całkiem dobry, ale brakuje nam informacji szczególnych dla naszego przypadku:
- Interfejs jakiego wzorca powinniśmy zaimplementować?
- Jak pominąć klasy, które zawierają brakujące pole?
- Jak odfiltrować klasy anonimowe lub wewnętrzne?
- Jak dodatkowo zaimplementować poprawkę do walidacji wzorca?
- Jak przetestować poprawkę w sposób automatyczny?

Najłatwiejszym sposobem znalezienia odpowiedzi na te (i inne istotne dla Ciebie) pytania jest ponowne spojrzenie na [zestaw wzorców błędów](https://errorprone.info/bugpatterns).
Odszukaj na liście wzorce, które są częściowo podobne do tego, co chcesz osiągnąć.
Kod źródłowy Error Prone na licencji Apache 2.0 znajdziesz na [GitHubie](https://github.com/google/error-prone).
Wyszukując nazwę wzorca, zauważysz zarówno implementację, jak i przypadki testowe.
W tych dwóch miejscach znajdziesz informacje o interfejsach używanych podczas implementacji do realizacji konkretnych wymagań wzorca oraz sposób jego testowania.

W przypadku weryfikacji pola `serialVersionUID` możesz zacząć od implementacji interfejsu *ClassTreeMatcher*.
Jeśli przejdziesz do dokumentacji Javadocs pierwszego parametru *ClassTree* jedynej metody tego interfejsu,
przekonasz się, że powinien przetwarzać takie elementy jak: klasa, interfejs, enum, rekord lub typ adnotacji.

Dwa filtry Error Prone –
jeden dla implementacji `java.io.Serializable` a drugi dla pola `serialVersionUID` – pozwoli Ci dotrzeć do sedna zadania.
W przypadku gdy nie możesz znaleźć dopasowania do swojego przypadku użycia (na przykład weryfikacja czy klasa jest zagnieżdżone),
możesz odpytać interfejs AST JDK przy pomocy metod pomoczniczych Error Prone z klasy *ASTHelpers*.


```java
import com.google.auto.service.AutoService;
import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.matchers.Matcher;
import com.google.errorprone.matchers.Matchers;
import com.google.errorprone.suppliers.Suppliers;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;

import javax.lang.model.element.Modifier;

import static com.google.errorprone.matchers.Matchers.allOf;
import static com.google.errorprone.matchers.Matchers.hasModifier;
import static com.google.errorprone.matchers.Matchers.isSubtypeOf;


@AutoService(BugChecker.class)
@BugPattern(
        name = "SerialVersionUIDCheck",
        summary = "Serializable implementation missing serialVersionUID field",
        severity = BugPattern.SeverityLevel.ERROR
)
public class SerialVersionUIDCheck extends BugChecker implements BugChecker.ClassTreeMatcher {

    private static final Matcher<ClassTree> SERIALIZABLE_INTERFACE =
            allOf(isSubtypeOf("java.io.Serializable"));
    private static final Matcher<VariableTree> SERIAL_VERSION_UID =
            allOf(
                    Matchers.isSameType(Suppliers.LONG_TYPE),
                    hasModifier(Modifier.STATIC),
                    hasModifier(Modifier.FINAL),
                    (varTree, __) -> varTree.getName().contentEquals("serialVersionUID"));

    @Override
    public Description matchClass(ClassTree tree, VisitorState state) {
        var currentClass = ASTHelpers.getSymbol(tree);

        if (!SERIALIZABLE_INTERFACE.matches(tree, state)) {
            System.out.println("Skip " + tree.getSimpleName());
            return Description.NO_MATCH;
        }
        if (!Tree.Kind.CLASS.equals(tree.getKind())) {
            System.out.println("Skip non-class " + tree.getSimpleName());
            return Description.NO_MATCH;
        }
        if (tree.getSimpleName() == null || tree.getSimpleName().isEmpty()) {
            System.out.println("Skip anonymous class");
            return Description.NO_MATCH;
        }
        if (currentClass.hasOuterInstance() && currentClass.isStatic()) {
            System.out.println("Skip static class "  + tree.getSimpleName());
            return Description.NO_MATCH;
        }
        
        boolean containsSerialVersionUID = tree.getMembers().stream()
                .filter(mem -> mem instanceof VariableTree)
                .map(mem -> (VariableTree) mem)
                .anyMatch(varTree -> SERIAL_VERSION_UID.matches(varTree, state));
        if (containsSerialVersionUID) {
            System.out.println("Already contains serialVersionUID "  + tree.getSimpleName());
            return Description.NO_MATCH;
        }
        
        System.out.println("Pass " + tree.getSimpleName());
        SuggestedFix fix = SuggestedFixes
                .addMembers(tree, state, "private static final long serialVersionUID = 1L;");
        return describeMatch(tree, fix);
    }

}
```

Wreszcie, za pomocą buildera *SuggestedFixes* możesz zaimplementować poprawkę kodu.
Aby włączyć tryb aplikacji poprawek, dodaj argumenty kompilacji `XepPatchChecks` i `XepPatchLocation`:
```xml
<arg>-Xplugin:ErrorProne -XepPatchChecks:SerialVersionUIDCheck -XepPatchLocation:IN_PLACE</arg>
```
Zamiast tworzyć oddzielny plik z patchem, opcja IN_PLACE spowoduje zastosowanie sugerowanej poprawki bezpośrednio na właściwym pliku.

```bash
# Patching OFF
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.10.1:compile (default-compile) on project code: Compilation failure: Compilation failure:
[ERROR] /home/t3rmian/IdeaProjects/demo/code/src/main/java/dev/termian/Stock.java:[5,8] [SerialVersionUIDCheck] Serializable implementation missing serialVersionUID field

# Patching ON
Refactoring changes were successfully applied to file:///home/t3rmian/IdeaProjects/demo/code/src/main/java/dev/termian/Product.java, please check the refactored code and recompile.
```


### Testy wzorców błędów

Zanim uruchomisz kompilację głównego kodu, warto napisać kilka testów. Samouczek sugeruje napisanie testów dla przypadków pozytywnych (dla których wzorzec
powinien zostać zaaplikowany) i negatywnych (dla których nie powinien).
Dwa niezwykle pomocne narzędzia do weryfikacji wzorców błędów to:
- *CompilationTestHelper*, który weryfikuje niestandardowe błędy zgłoszone podczas procesu kompilacji;
- *BugCheckerRefactoringTestHelper*, który weryfikuje poprawki zastosowane przez Twój wzorzec.

Zobaczmy teraz jak korzystać z tych dwóch helperów. Poniżej zobaczysz jeden pozytywny i jeden negatywny przypadek testowy kompilacji oraz stosowania poprawki.
Ostatni, piąty test zweryfikuje, czy asercje *BugCheckerRefactoringTestHelper* są uruchamiane poprawnie.
Zauważ, że możesz dodać kod źródłowy w postaci zwykłego tekstu, zamiast tworzyć podkatalog `testdata` z testowymi plikami wejściowymi.

```java
import com.google.errorprone.BugCheckerRefactoringTestHelper;
import com.google.errorprone.CompilationTestHelper;
import org.junit.Before;
import org.junit.Test;

import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.assertThrows;

public class SerialVersionUIDCheckTest {

    private CompilationTestHelper compilationHelper;
    private BugCheckerRefactoringTestHelper fixHelper;

    @Before
    public void setup() {
        compilationHelper = CompilationTestHelper
            .newInstance(SerialVersionUIDCheck.class, getClass());
        fixHelper = BugCheckerRefactoringTestHelper
            .newInstance(SerialVersionUIDCheck.class, getClass());
    }

    @Test
    public void missingSerialVersionUID_SimpleSerializableImplementation() {
        AssertionError assertionError = assertThrows(AssertionError.class, () -> {
            compilationHelper.addSourceLines(
                    "SimpleSerializableImplementation.java",
                    "import java.io.Serializable;",
                    "public class SimpleSerializableImplementation implements Serializable {}")
                .doTest();
        });
        assertThat(assertionError.getMessage())
            .contains("Serializable implementation missing serialVersionUID field");
    }

    @Test
    public void missingSerialVersionUID_SimpleSerializableImplementation_VersionFieldExists() {
        compilationHelper.addSourceLines(
                "SimpleSerializableImplementation.java",
                "import java.io.Serializable;",
                "public class SimpleSerializableImplementation implements Serializable {",
                "private static final long serialVersionUID = 1L;",
                "}")
            .doTest();
    }


    @Test
    public void missingSerialVersionUID_SimpleSerializableImplementation_Fix() {
        fixHelper
            .addInputLines(
                "SimpleSerializableImplementation.java",
                "import java.io.Serializable;",
                "public class SimpleSerializableImplementation implements Serializable {}")
            .addOutputLines(
                "SimpleSerializableImplementation.java",
                "import java.io.Serializable;",
                "public class SimpleSerializableImplementation implements Serializable {",
                "private static final long serialVersionUID = 1L;",
                "}")
            .doTest();
    }

    @Test
    public void missingSerialVersionUID_SimpleSerializableImplementation_NoFix() {
        fixHelper
            .addInputLines(
                "SimpleSerializableImplementation.java",
                "import java.io.Serializable;",
                "public class SimpleSerializableImplementation implements Serializable {",
                "private static final long serialVersionUID = 2L;",
                "}")
            .addOutputLines(
                "SimpleSerializableImplementation.java",
                "import java.io.Serializable;",
                "public class SimpleSerializableImplementation implements Serializable {",
                "private static final long serialVersionUID = 2L;",
                "}")
            .doTest();
    }

    @Test
    public void missingSerialVersionUID_SimpleSerializableImplementation_MonkeyChange() {
        Throwable unexpectedFixError = assertThrows(Throwable.class, () -> {
            fixHelper
                .addInputLines(
                    "SimpleSerializableImplementation.java",
                    "import java.io.Serializable;",
                    "public class SimpleSerializableImplementation implements Serializable {}")
                .addOutputLines(
                    "SimpleSerializableImplementation.java",
                    "import java.io.Serializable;",
                    "public class SimpleSerializableImplementation implements Serializable {",
                    "private static final long serialVersionUID = 2L;",
                    "}")
                .doTest();
        });
        assertThat(unexpectedFixError.getMessage())
            .contains("Expected node: Line 3 COMPILATION_UNIT" +
                "->CLASS(SimpleSerializableImplementation)" +
                "->VARIABLE(serialVersionUID)->LONG_LITERAL(2)");
    }
}
```

<img src="/img/hq/error-prone-fix-serializable-missing-serialversionuid.png" alt="Testy poprawki Error Prone brakującego pola serialVersionUID implementacji interfejsu Serializable" title="Testy poprawki Error Prone brakującego pola serialVersionUID implementacji interfejsu Serializable">

Po dostatecznym przetestowaniu poprawki możesz pozostawić ją w konfiguracji, a zostanie ona zaaplikowana, gdy ktoś skompiluje nową klasę.
Możliwość automatyzacji i testów daje wyraźną przewagą nad funkcjonalnością wyszukiwania strukturalnego i zamiany w IntelliJ, która pozwala na osiągnięcie podobnego rezultatu.
Z drugiej strony rozwiązanie to wprowadza dodatkowe narzędzie w procesie kompilacji, którego może niekoniecznie potrzebujesz lub chcesz utrzymywać.
