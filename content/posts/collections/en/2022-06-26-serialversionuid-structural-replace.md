---
title: Quick-fix all Serializable classes missing serialVersionUID field
url: quick-fix-serializable-missing-serialversionuid
id: 89
category:
  - java: Java
tags:
  - intellij
  - structural search/replace
author: Damian Terlecki
date: 2022-06-26T20:00:00
---

In Java, declaring a `serialVersionUID` field on a *Serializable* interface implementation can give you better control over various compatibility scenarios.
You can read more about these and the pros/cons of this approach [here](https://www.vojtechruzicka.com/explicitly-declare-serialversionuid).
In the IntelliJ, you will find a "Serializable class without 'serialVersionUID'" inspection that you can turn on and apply a quick fix (ALT+Enter on the class name).

Suddenly deciding that you want all your classes to have this field will pose a pretty mundane task. 
The quick fix cannot be applied in a batch (at least in the current version, i.e. 222.3153.4). Having a look at the [implementation](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/plugins/InspectionGadgets/src/com/siyeh/ig/serialization/SerializableInnerClassHasSerialVersionUIDFieldVisitor.java),
it also does not implement the standard cleanup interface that could be used for the IntelliJ code cleanup.  

## Structural Search/Replace

There is, however, a different feature in the IntelliJ that you can use to implement such a quick-fix batch.
Search and replace structurally is a mechanism to find and replace parts of code according to the supported language syntax.
You will find this feature using quick actions (CTRL+SHIFT+A) or in menu: Edit > Find > Replace Structurally.

<figure class="flex">
<img src="/img/hq/serialversionuid-search-and-replace-structurally.png" alt="IntelliJ Structural Search/Replace" title="IntelliJ Structural Search/Replace">
<img src="/img/hq/replace-structurally-intellij.png" alt="IntelliJ Replace Structurally" title="IntelliJ Replace Structurally">
</figure>

Firstly, take a look at some examples to familiarize yourself with this feature.
While structural search is really usable, the replacement on the other hand can be quirky.
Initially, you might create the search with an interface element like the above, but you will quickly find out that the replacement removes interfaces not matching the template:
```java
// Before
public class Foo extends AbstractClass implements IFooSerializable, IFoo {}
public class Bar extends AbstractClass implements Serializable, IFoo {}
// After
public class Foo extends AbstractClass {}
public class Bar extends AbstractClass implements Serializable {}
```

To achieve desired results, limit the search criteria to the class alone. This way, the interfaces will be kept intact. It is not a straightforward approach, but 
structural search and replace gives you access to the advanced IntelliJ API. Take a look at the [implementation](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/plugins/InspectionGadgets/src/com/siyeh/ig/serialization/SerializableInnerClassHasSerialVersionUIDFieldVisitor.java) 
again. You can actually reuse this logic in the search script (Groovy). All you need to know is that the context of the search is the IntelliJ [PsiClass](https://github.com/JetBrains/intellij-community/blob/idea/222.3153.4/java/java-psi-api/src/com/intellij/psi/PsiClass.java).

```groovy
!__context__.interface &&
        !__context__.enum &&
        !__context__.record &&
        __context__.qualifiedName != null &&
        __context__.isInheritor(com.intellij.psi.JavaPsiFacade.getInstance(__context__.project)
                .findClass(Serializable.class.getCanonicalName()), true)
```

This is not a 1-to-1 implementation of the original inspection but does a pretty good job covering all major cases.
Noteworthy lack of field is identified by RegEx with a 0 occurrence count of the field.
You can import this template in the search window and improve it further for your needs:
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

> **Note:** The structural replace also reformats the code in the whole file. This behavior is currently [reported](https://youtrack.jetbrains.com/issue/IDEA-167576/Structural-replace-introduces-static-imports) as a bug, so please keep it in mind when running it in a legacy code.
