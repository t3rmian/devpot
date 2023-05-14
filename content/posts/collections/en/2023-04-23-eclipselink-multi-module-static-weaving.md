---
title: EclipseLink multi-module static weaving caveats
url: eclipselink-multi-module-static-weaving
id: 109
category:
  - java: Java
tags:
  - jpa
  - eclipselink
  - bytecode
author: Damian Terlecki
date: 2023-04-23T20:00:00
---

JPA providers often use weaving (manipulation of compiled Java classes byte-code) to enable the full capabilities of the implementation.
In the case of EclipseLink, it serves the lazy field handling for `@ManyToOne`, `@OneToOne`, `@Basic`, change tracking, and many other optimizations.
Some EJB 3+ compliant containers, like WebLogic, provide an automatic weaving. For Java SE, you would have to parametrize a Java agent for this. 

Another option besides disabling the weaving is static (at build-time) weaving. You can do this by running the `eclipelink.jar` through a Maven
Ant task or a designated plugin. You will find a sufficient explanation of such configuration in [the documentation](https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Advanced_JPA_Development/Performance/Weaving/Static_Weaving).

## Multi-module static weaving with a mapped superclass

The unobtrusive nature of the weaving makes it easy to forget after the initial setup. Otherwise, it will remind
itself when transitioning to a multi-module project configuration. If unaddressed early, your app may start crashing with an OOM.

<img src="/img/hq/eclipselink-no-weaving.png" title='Weaving warning controlled by the "eclipselink.logging.level" persistence property' alt='[EL Warning]: metadata: 2023-04-23 17:26:05.917--ServerSession(1234586997)--Thread(Thread[main,5,main])--Reverting the lazy setting on the OneToOne or ManyToOne attribute [address] for the entity class [class com.example.MyEntity] since weaving was not enabled or did not occur.'>

The above error is a clear indication that you missed or incorrectly configured the weaving. Now, static weaving gets quite tricky when used together with a common module
that shares `@MappedSuperclass`. It is true even if both modules are weaved. There were [enhancements](https://bugs.eclipse.org/bugs/show_bug.cgi?id=466271) to improve this feature for multi-module projects in the past.
However, under complex setups it still seems insufficient. Let's take a simple JPA Person-Employee, multi-module inheritance example:

```java
// base-module
@MappedSuperclass
public abstract class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    private String name;

    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "ADDRESS_ID")
    private Address address;

    // getters/setters
}

// extension-module
@Entity
public class Employee extends Person {

    private String department;
    
    // getters/setters
}
```

For this example, you can encounter several different errors.

### Missing weaving of the base module

When you forget to weave the base module, you will find that the compilation of the extension module fails with a missing method in the subclass.

> Exception in thread "main" java.lang.NoSuchMethodError: com.example.MyEntity._persistence_shallow_clone()Ljava/lang/Object;

Do verify that your base module is properly weaved. In post-compilation, you should find entity classes in your target directory
containing `org.eclipse.persistence.*` bytecode.

### Internal weaving optimization

In combination with a default configuration of `<property name="eclipselink.weaving.internal" value="true"/>`, the
subclasses of the `@MappedSuperclass` expect a *super* constructor accepting
a `org.eclipse.persistence.internal.descriptors.PersistenceObject` interface implementation.

> javax.persistence.PersistenceException: Exception [EclipseLink-28019] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.EntityManagerSetupException  
> Exception Description: Deployment of PersistenceUnit [my-persistence-unit] failed. Close all factories for this PersistenceUnit.  
> Internal Exception: java.lang.NoSuchMethodError: 'void com.example.MyEntity.<init>(org.eclipse.persistence.internal.descriptors.PersistenceObject)'

This parameter allows for further internal optimizations. Unfortunately, EclipseLink weaver doesn't detect any use of
the `@MappedSupperclass` at the time of weaving the base module, missing the bytecode generation for such a constructor.

### Non-existent weaved `_vh_` method

The majority of bytecode generation responsibility lies in subclass processing. EclipseLink skips the optimization of lazy fields if the mapped class
doesn't have any usage. Thus, again, in the extension module, it is already too late to make any use of this information.
Likewise, the provider reports missing woven methods for lazy fields.

> Exception [EclipseLink-60] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.DescriptorException  
> Exception Description: The method [_persistence_set_address_vh] or [_persistence_get_address_vh] is not defined in the object [com.example.MyEntity].  
> Internal Exception: java.lang.NoSuchMethodException: com.example.MyEntity._persistence_get_address_vh()  
> Mapping: org.eclipse.persistence.mappings.ManyToOneMapping[address]  
> Descriptor: RelationalDescriptor(com.example.MyEntity --> [DatabaseTable(MYENTITY)])  

> Exception [EclipseLink-218] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.DescriptorException  
> Exception Description: A NullPointerException would have occurred accessing a non-existent weaved \_vh\_ method [_persistence_get_address_vh].  The class was not weaved properly - for EE deployments, check the module order in the application.xml deployment descriptor and verify that the module containing the persistence unit is ahead of any other module that uses it.  


## Solutions

If you're really inclined to use multi-module static weaving there is still a solution.
For proper bytecode generation, you need a complete set of classes from all modules.
The perfect place for this is an aggregator module. It can be the WAR/EAR module or the main module with all necessary dependencies.

At this point, you can unpack all dependencies (`maven-dependency-plugin`) and weave them combined. Then either use them in a post-processed fat jar or deploy them under a different classifier.

This static solution is quite flexible as you can enhance it with filtering. It is useful late in the development process for incremental adjustments when some code
relies on eager initialization (to limit occurrences of `LazyInitializationException`). You can do this by defining specific classes in a build-time `persistence.xml` together with `exclude-unlisted-classes` property.

Otherwise, I recommend the dynamic weaving. Simply add the `-javaagent:/path/to/eclipselink.jar` parameter to the Java runtime (or to the `JAVA_TOOL_OPTIONS` environment variable) and be done with it.
You will need this for your application, as well as the tests (if run from IDE) and plugins (if delegated to Maven – `maven-surefire-plugin`, `maven-failsafe-plugin`: `configuration` > `argLine`).

For Spring-based JPA configuration, take a look at the `LoadTimeWeaver` and `LoadTimeWeaverAware` interfaces.
Use whichever suits your environment the most, e.g, an auto-detectable `InstrumentationLoadTimeWeaver` when the agent is `spring-instrument`.