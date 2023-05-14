---
title: WebLogic preferred packages using REGEX
url: weblogic-preferred-libraries-regex
id: 110
category:
  - jee: JEE
tags:
  - weblogic
  - classloading
  - docker
author: Damian Terlecki
date: 2023-05-14T20:00:00
---

<img src="/img/hq/wls-prefer-application-packages.png" title='An excerpt from the content of the WebLogic server descriptor that separates packets: EL=application, MOXy=WLS (compatible with metro-jax-ws)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

The Java EE server – WebLogic – offers a feature to overwrite the libraries provided as standard by the container.
[Such configuration](/posts/weblogic-library-conflicts) is possible through the `weblogic.xml` descriptor placed in the `WEB-INF` folder of a WAR artifact or the `weblogic-application.xml` descriptor
put in the `META-INF` directory of an EAR archive.

You will easily find example usages of `prefer-application-packages` and `prefer-application-resources` elements for loading classes and resources, respectively.
Example filters sometimes (and sometimes not) end with a `.*` suffix, resembling REGEX or GLOB.
The documentation, however, does not explain the details of this format, which are rather significant when you want to apply complex filtering.

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

Does the above configuration prefer classes from packages `com.sample`, `com.sample.example`, `com.sample.example.subexample`, or one of these combinations?
How to configure a matching for all packages from `com.sample.*` except `com.sample.example`?
Can you filter the classes down to the full name, or does the feature apply only to packages (inferred from the element's name)?

## WebLogic FilteringClassLoader

All questions lead to the code. `FilteringClassLoader` is the class to look for among the dependencies provided by WebLogic.
This name comes from the reporting of another handy tool – the Classloader Analysis Tool.
You will find this class as soon as you load the T3 protocol client library `${WL_HOME}/server/lib/wlthint3client.jar`.
More precisely, it resides in the `weblogic.utils.classloaders` package.

Due to licensing reasons, the library is not resolvable from a Maven Central repository.
For verification purposes, you can extract it from a container of the official docker image as an alternative to the WLS installation:
```bash
#!/bin/bash
# Login, review and accept license at https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

Now, the bytecode of the `weblogic.utils.classloaders.FilteringClassLoader` seems to translate to the following algorithm:
1. Load the pattern and remove the trailing `*` character;
2. Add `{0,1}` suffix if the pattern ends in `.`;
3. Prefix the pattern with `^`;
4. Create `java.util.regex.Pattern` and call `matcher(String)` for the full name of the class/resource using the `find()` method.
5. If no match is found, delegate the loading of `loadClass/getResourceInternal/getResource/getResources` to the parent classloader, otherwise return the class/resource provided by the application.

It shows that the `prefer-application-packages` and `prefer-application-resources` elements allow for fine filtering of packages and resources, as well as individual classes using REGEX.
Note that there are some additions, e.g., with regard to the beginning and ending characters `*` and `.`.

The end-line character is not added to the pattern. Combined with the use of the `find()` method, it increases the number of filtered packets due to partial (as an alternative to the `matches()`) matching.
In addition, the package separator works here as an arbitrary character match, which at first glance may be ambiguous and very rarely can lead to a filtering that is broader than intended.

Finally, the mechanism allows you to define a regular expression that will skip the subpackage. Such an expression (e.g., `^com.sample(?!\.example$)`) will cause a fall back to the WLS-provided set of libraries if no other match is found.
However, do try to use simple expressions. Excessive backtracking may lead to increased application initialization time.
