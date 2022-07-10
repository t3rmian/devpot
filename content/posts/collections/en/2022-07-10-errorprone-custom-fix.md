---
title: Fix all Serializable classes missing serialVersionUID field with Error Prone
url: error-prone-fix-serializable-missing-serialversionuid
id: 90
category:
  - java: Java
tags:
  - jvm
  - structural search/replace
  - maven
  - errorprone
author: Damian Terlecki
date: 2022-07-10T20:00:00
---

In the [previous article](quick-fix-serializable-missing-serialversionuid), I've shown you how to apply a batch fix to missing
`serialVersionUID` fields in all *Serializable* implementations using IntelliJ. Let's now check how to implement the same operation using
[Error Prone](https://errorprone.info/), a static analysis tool you can use during the compilation process.

Out of the box, Error Prone comes with a [set of bug patterns](https://errorprone.info/bugpatterns) that you can enable to improve your compilation process.
Serialization versioning is, unfortunately, not among these checks, but the tool provides you the interface to implement your own patterns.
Moreover, you're not limited to throwing your custom compilation errors, but you can also implement automatic fixes to your code during compilation time.
Writing a custom check is a perfect place to learn how Error Prone works and figure out how it can improve the development process.

## Error Prone Installation

Error Prone installation will mainly depend on what build tools you are using in your project.
I will show you the setup for Maven and one of the newer JDKs (18), as it is currently a bit confusing due to strong JDK internals encapsulation (JDK 16).
You will find installation steps on the Error Prone site, but for setting up your custom checks, you will have to connect some more dots.

The installation for Maven consists of adding the Error Prone annotation processor to the compilation plugin:

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

For JDK 16 and newer, this is not sufficient. Don't be surprised by the following error during the compilation:
```java
java.lang.IllegalAccessError: class com.google.errorprone.BaseErrorProneJavaCompiler (in unnamed module @0x57c6feea) cannot access class com.sun.tools.javac.api.BasicJavacTask (in module jdk.compiler) because module jdk.compiler does not export com.sun.tools.javac.api to unnamed module @0x57c6feea
```
You can overcome this issue by adding a `.mvn/jvm.config` file in the maven project's root directory with the following content:
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
These options expose JDK internal API for Error Prone during the compilation process started by Maven.

## Writing your own checks

The next step is to add your own logic to the compilation process.
Firstly, you will need to set up a separate module where the checks will reside.
After implementing your patterns you will compile them and run them during the compilation of your main code.

### Maven configuration

You can add your own checks to the annotation processor path shown previously.
Below I've added a custom artifact `dev.termian.processor:0.0.1-SNAPSHOT` that I will set up and implement in a moment.
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

In your own project, you can divide your codebase into two modules, one with code and another with compilation checks (processor).
Alternatively, you can create a separate project just for the patterns, but you will have to handle the compilation order without Maven's help.

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

In the processor module, add dependencies for:
- Error Prone Check API to get the interfaces for implementing the patterns;
- Google auto-service that will discover and load your custom check;
- Error Prone Test Helpers to test the validation of compilation patterns and source code fixes.

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

You will need to write some unit tests, I suggest adding some JUnit dependencies, but the test framework choice is up to you.
Keep in mind that during test runtime, you will have to have access to the JDK internal API. With the Maven Surefire Plugin, you
can again ease on the Java runtime internals encapsulation by providing relevant JVM arguments:
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

Note that I've repeated the arguments also in the compiler plugin as the `.mvn/jvm.config` did not quite work for me when running (compiling) the module for tests
using IntelliJ. This was happening despite the "Delegate IDE build/run actions to Maven" option being enabled.

### Checks implementation

Now that you've configured the module for implementing Error Prone checks, you can scan over the [tutorial for writing a check](https://github.com/google/error-prone/wiki/Writing-a-check).
In our case, we want to write a missing `serialVersionUID` compilation fix/check. The tutorial is quite good, but we lack information specific to our goal:
- Which matcher interface to implement?
- How to skip classes that already contain the field?
- How to filter out anonymous or inner classes?
- How to implement a fix as an addition to the check validation?
- How to test the fix?

The easiest way to figure out the answers to these (and other relevant for you) questions is to a look again at the [set of bug patterns](https://errorprone.info/bugpatterns).
Find out the checks that are similar in some parts with what you're trying to achieve.
You will find Error Prone under Apache 2.0 license on the [GitHub](https://github.com/google/error-prone).
By searching for a check name, you should find the implementation and a test case containing the information about used interfaces for filtering and verification.

In the case of a `serialVersionUID` check, you can start with the *ClassTreeMatcher*. If you go to the Javadocs for the *ClassTree* parameter of this matcher's method,
you will find that it should process elements like class, interface, enum, record, or annotation type.

The two Error Prone matchers – 
one for implementation of `java.io.Serializable` and the second for a `serialVersionUID` field – will allow you to get to the core of the task.
Whenever you can't find a matcher for your use case (like finding out the nested class),
you can query against the JDK AST interface with some help from the Error Prone *ASTHelpers* utils. 

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

Finally, with the *SuggestedFixes* builder, you can implement a patch to the code.
To switch the Error Prone mode from verification, add the `XepPatchChecks` and `XepPatchLocation` compilation arguments:
`<arg>-Xplugin:ErrorProne -XepPatchChecks:SerialVersionUIDCheck -XepPatchLocation:IN_PLACE</arg>`. The IN_PLACE option will
apply the suggested fixes directly to the file instead of creating a separate patch file.

```bash
# Patching OFF
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.10.1:compile (default-compile) on project code: Compilation failure: Compilation failure:
[ERROR] /home/t3rmian/IdeaProjects/demo/code/src/main/java/dev/termian/Stock.java:[5,8] [SerialVersionUIDCheck] Serializable implementation missing serialVersionUID field

# Patching ON
Refactoring changes were successfully applied to file:///home/t3rmian/IdeaProjects/demo/code/src/main/java/dev/termian/Product.java, please check the refactored code and recompile.
```


### Testing bug patterns
Before you run the checks, you should write some tests. The tutorial suggests implementing tests for positive and negative cases.
Two extremely helpful utils for verification of bug patterns are:
- *CompilationTestHelper* that verifies custom errors thrown during the compilation process;
- *BugCheckerRefactoringTestHelper* that verifies fixes applied by your bug checker.

Let's now see those two in use. Below you will see one positive and one negative case once for the compilation and the application of a fix.
The last, 5th test will also verify that the *BugCheckerRefactoringTestHelper* assertions are fired correctly.
Note that you can add a plaintext source code instead of creating a `testdata` subdirectory with test input files.

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

<img src="/img/hq/error-prone-fix-serializable-missing-serialversionuid.png" alt="Error Prone fix Serializable missing serialVersionUID tests" title="Error Prone fix Serializable missing serialVersionUID tests">

Confident enough with your fix, you can keep it for the future whenever someone compiles a new class.
The possibility of automation and tests is a clear advantage over IntelliJ structural search and replace feature.
On the other hand, it introduces an additional tool in the build process that you might not necessarily need or want to maintain.
