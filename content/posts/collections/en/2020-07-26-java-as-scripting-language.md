---
title: Java as scripting language
url: java-as-scripting-language
id: 35
tags:
  - java
  - shell
author: Damian Terlecki
date: 2020-07-26T20:00:00
source: https://github.com/t3rmian/devpot/pull/64/files
---

The first thing that comes to my mind when thinking about scripting is bash shell and handy Linux tools like *grep*, *sed* and *awk*. Sometimes, though, the scripting task might not be trivial, and figuring out a clean solution in bash might take a considerable amount of time. This is especially true if you're not writing scripts on a day-to-day basis.

Some would prefer Python due to its simple and clean syntax. However, as a Java developer, I seldom have the chance to work with Python. Except for the local environment, I'm usually left with bash scripting. Recently, however, I've started exploring Java as a scripting language. 

Since Java is quite verbose language it may not be the best language to write scripts. 
However, Java 8 lambdas and streams together with Java 10 `var` keyword are a great improvement in this area.
If Java is your most used language, it will probably take you the least amount of time to come up with a decent solution.

What's more, Java 9 brought us the JShell, and since Java 11 we no longer have to compile the single source file programs explicitly. This allows us to treat Java more like an interpreted language (even if it's technically compiled into the memory).

### Executing Java program ('script')

With so many options, we can write a single Java class with the main method and:
  - **[JDK 11+]** Execute it with `java Scratch.java` (with default source target of the current JDK) or `java --source 11 scratch` (without known extension);
  - **[JDK 11+]** Use it as an executable script using *shebang*:
    - add `#!/usr/bin/java --source 11` at the start of the file (the filename should be without the `.java` extension);
    - add the executable flag `chmod +x scratch`;
    - execute it `./scratch`;
  - **[JDK 9+]** Load it into JShell `jshell Scratch.java` and execute the main method `Scratch.main()`;
    - we exit the `jshell` using `/exit` command.

Before Java 9 we had to explicitly compile the source files before executing them:
1. `javac Scratch.java`;
2. `java Scratch` (the class with the main method on the default classpath which is the current directory);

which was not very convenient. Given these three options, we can easily come up with a nice solution that does not rely on Linux tools.

I recommend familiarizing yourself with the new API features of Java 9-14 like collection factory methods and string enhancements, as well as reviewing Java 7 `java.nio.file`. It will come handy in your scripts. An example has been linked below.