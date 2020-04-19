---
title: How (not) to run NodeJS in Java
url: nodejs-in-java
id: 28
tags:
  - java
  - nodejs
author: Damian Terlecki
date: 2020-04-19T20:00:00
---

Usually, you would run your NodeJS application in a docker container. What if your hosting does not support dockerized applications? Well, then surely you will be able to install the NodeJS yourself, right? But what if this also not the case? The servers could be cut off from the internet, with very limited options to access the environment besides the automated deployment of Java application.

Let's have a look at the possible solutions, given we can run the applications only on the JVM. All other cases, where you might just want to run some NodeJS scripts from Java would also apply here. Though, always ask yourself whether it is worth it.

## Portable NodeJS

Just like JVM is a runtime for java bytecode, NodeJS is a runtime for JavaScript code that is executed outside of a web browser. The first thing you will need to do is to prepare a portable version of NodeJS for the target system. If you already have it installed, and want only to execute the code, you can skip this step.

Looking at the [installation notes](https://github.com/nodejs/help/wiki/Installation) for Linux (and most likely Windows), this is pretty straightforward:
1. Go to [https://nodejs.org/dist/](https://nodejs.org/dist/).
2. Select and download the desired binary version (e.g. *node-v12.16.2-linux-x64.tar.gz*).
3. Unpack it, and it's mostly ready to go.

We can put the archive together within our JAR or WAR. If we place it under the `src/main/resources`, it will be copied over to the `classes` directory during the build process. At the runtime, we will be able to access it through the class loader:
- `getClass().getClassLoader().getResourceAsStream("node-v12.16.2-linux-x64.tar.gz")`;
- `Thread.currentThread().getContextClassLoader().getResourceAsStream("node-v12.16.2-linux-x64.tar.gz")` in an Application Server.

We want to load the file as an `InputStream` so that it works the same way whether our resources will be read from exploded or unexploded archive (WAR/JAR). See [this](https://stackoverflow.com/questions/676250/different-ways-of-loading-a-file-as-an-inputstream) StackOverflow answer for more details on loading a file as an input stream.

For unpacking the NodeJS it's easier to use an archiving library like [jararchivelib](https://rauschig.org/jarchivelib/). You can implement the details yourself, e.g: you could unpack it to the `/tmp/` directory; or any other destination to which the user under which the application will be run, has the read/write permissions.

## Build a NodeJS app

Since `npm` is also packed with the NodeJS binaries, you could probably bundle your source code and compile it during runtime. However, this process might be too long, and you might not want to pack the unobfuscated source code together. The access to npm registry or git repositories might as well be blocked from inside the server on which the app is deployed.

There are some options for [installing node.js packages for a different architecture](https://stackoverflow.com/questions/24961623/installing-node-js-packages-for-different-architecture), but they are rather cumbersome. What I recommend is to spin up a docker environment for the build process. This environment should match as closely as possible to the target environment (architecture/OS/native libraries). Only then you will be able to test whether there are no problems with modules that depend on native libraries.

After building the app you will want to bundle it like the NodeJS runtime. The archive should consist of the minified application script and the *node_modules* directory. Since the *node_modules* can be big in size and in the number of files, you could try pruning it only to the necessary for production dependencies: `npm prune --production`.

<img src="/img/hq/node_modules.jpg" alt="node_modules" title="node_modules">

## Running NodeJS from Java

Assuming you've implemented unpacking the NodeJS runtime and the compiled app, the last step is to execute the script from the Java runtime. For this, we will use the `ProcessBuilder`. The other option involves executing the app through `Runtime.getRuntime()`, but the API of the former one is a bit nicer.

Two things you must be aware of is that:
1. Usually, the *node* file needs to have the executable bit set: `new File(pathToBinNode).setExecutable(true);`.
2. > If there is a security manager, its checkExec method is called with the first component of this object's command array as its argument. This may result in a SecurityException being thrown (from [javadoc](https://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html)).

Assuming you're aware of these shortcomings, we can run the script the following way:

```java
public void startNodeJsApp(String pathToBinNode, String pathToAppScript,
        Map&lt;String, String&gt; applicationEnvironmentVariables)
        throws IOException, InterruptedException {
    ProcessBuilder processBuilder = new ProcessBuilder();
    processBuilder.command(pathToBinNode, pathToAppScript);
    Map&lt;String, String&gt; environment = processBuilder.environment();
    environment.putAll(applicationEnvironmentVariables);
    processBuilder.inheritIO();
    processBuilder.start().waitFor();
}
```

The code will start the application script using provided NodeJS runtime with additional environment variables defined by us. Furthermore, the source and destination of the I/O operations will be inherited from the current Java process. This means that any output will be printed on the console by default. 

Currently, the running thread will also be **blocked until the process finishes**. It's important to know this in case you plan to run a NodeJS server. In such a situation you might consider wrapping the above code in another thread so that your main flow is not blocked. Furthermore, you need to know that the `waitFor()` method can be interrupted by calling `interrupt()` on the thread. This will throw the `InterruptedException` and return control over the thread back, though it does not mean that the underlying process will exit.

To be safe you should call the `destroy()` method on the `Process` object returned by the `ProcessBuilder.start()` in the `finally` block:
```java
    } finally {
        if (process != null && process.isAlive()) {
            process.destroy();
        }
    }
```

There are still some very rare cases, where the JVM will have to terminate without the time to clean up the resources (JVM crash). In such a situation you might be left with a running NodeJS process. A workaround for this is to kill such a process during the next startup e.g. by invoking `pkill -f '*node*script_name*`.


### Handling the output

It's also possible to redirect the output to a file using `redirectInput/redirectError`. The process output is represented by an `InputStream` from which we can also read manually:

```java
    try (BufferedReader processOutputReader = new BufferedReader(
            new InputStreamReader(process.getInputStream()))) {
        String line;
        while ((line = processOutputReader.readLine()) != null) {
            logger.info(line);
        }
    }
    process.waitFor();
```

For a non-blocking flow, you can also wrap this in a thread runnable.

## Summary

Running NodeJS from Java is certainly possible and you could even have your Java process act as a proxy to the NodeJS application. However, you should consider whether a such solution is suitable in your case. This might drastically decrease the maintainability of your project.

Note that bundling the NodeJS on an Application Server (Jave EE) might be [highly questionable](https://www.oracle.com/technetwork/java/restrictions-142267.html). **If at all**, you should at least consider using container solution for thread management like a `ManagedThreadFactory.newThread()` to spawn your threads.

```java
  @Resource
  ManagedThreadFactory threadFactory;
```

Finally, there are also some solutions to run the NodeJS directly inside the JVM ([Trireme](https://github.com/apigee/trireme), [Nodyn](https://www.nodyn.io), Avatar-JS). However, they either support only the older versions of NodeJS (0.10/0.12) due to Rhino based compatibility scope, or they are not mature enough, or they are no longer maintained.