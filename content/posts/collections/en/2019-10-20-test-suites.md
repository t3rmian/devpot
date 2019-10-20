---
title: Test suites, categorization and parallelism
url: test-suites-categorization-and-parallelism
id: 15
tags:
  - testing
  - java
  - android
  - maven
  - gradle
author: Damian Terlecki
date: 2019-10-20T20:00:00
---

Writing automated tests might be considered a boring chore by many people. Nevertheless, everyone will agree, that a decent coverage will yield you a lot of saved time later on. Especially as the team members might change over time, and it might be hard to predict the consequences of even small changes for the newcomers.

Pointing out the importance of tests, let's now ask the main question. When and why you should consider creating test suites and start categorizing your tests?

### Test execution takes too much time

This is not a problem in the case of unit tests. Integration verification might come to your mind, but it's often not the case either. Surely, it takes more time to initialize some module, service or test database, than to test a few isolated lines in the code. However, the main culprit here is the end to end type and user interface type tests.

<img src="/img/hq/test-pyramid.svg" alt="Mike Cohn's Test Pyramid" title="Mike Cohn's Test Pyramid">

You might say that you don't need E2E/UI tests. And that might be true depending on the application type. For example, if the system under test is only a backend service that exposes some API in the form of web services it's a no wonder you won't have to touch this problem. Though, if your application is in majority composed of a user interface, the case may be different. You will almost always forget to test at least one important path in your unit/integration test. Often these paths are crucial and can expose some unwanted behavior.

An example from me of such a use case was a problem with zoom controls in one of my Android apps. A UI test that was failing for me, detected that one of the menu items was impossible to interact due to incorrect overlay ordering. I was quite proud of finding that out as I completely forgot about this aspect of the application.

The main point of why UI and E2E tests take considerably longer time is that in each step, the application has to load all necessary resources and display them to the (test engine) user. Sometimes you can save a few seconds here and there, by reusing the application state from the previous test. On the other hand, it increases the text complexity. Then, you have to introduce test ordering, which makes it harder to verify dependent tests in case of failures. Sometimes you would want to have your tests completely isolated. Restarting the app can take the majority of the time.

### Parallelization

The first thing that comes to mind is the test parallelization. Speeding up the test phase is a critical factor in telling whether the new version is stable and ready for production. We can achieve this at two levels. Firstly, we can modify some neat parameters of our build tools:
- Gradle has [maxParallelForks](https://docs.gradle.org/current/dsl/org.gradle.api.tasks.testing.Test.html#org.gradle.api.tasks.testing.Test:maxParallelForks) which enables parallelized test execution:

```groovy
tasks.withType(Test) {
    maxParallelForks = Runtime.runtime.availableProcessors().intdiv(2) ?: 1
}
```
- in Maven you can use a very satisfying [configuration options](https://www.baeldung.com/maven-junit-parallel-tests) of surefire and failsafe plugins.

In some cases though, it might be hard to parallelize E2E/UI tests at this level, for example in Android, where you can only execute one test at a time (out of the box) on a given device. So, the second option is to create separate test suites and categorize your tests to run these groups at the same time, just on different devices.

This way you can kill two birds with one stone. Not only you can speed up your testing phase, but also categorize your test cases by priority or by their sometimes non-deterministic results. You will know immediately whether a failing case is for some critical feature or maybe it's this quirky low-prio bug that occurs once in a blue moon. Sometimes it can be just the test itself which is flaky (in the past [Google reported that 1 in 7 tests](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) sometimes failed in a way not caused by a change in code).

Coming back to our topic, if you've yet to guess where we would parallelize the test execution - it's in your automation server. I won't dwell into specifics of this, as I have experienced only some of these tools, but you can refer to the official documentation:
- [parallel stages in Jenkins](https://jenkins.io/doc/book/pipeline/syntax/#parallel);
- [build matrix in Travis](https://docs.travis-ci.com/user/build-matrix/) and [parallel jobs](https://docs.travis-ci.com/user/speeding-up-the-build/);
- [parallelism in CircleCI](https://circleci.com/docs/2.0/parallelism-faster-jobs/).

This way you will be able to run your categorized tests in parallel. Let's now go over how to create test suites, prepare test groups and configure the build tool (Maven/Gradle) to execute them. I will focus mostly on Android and Java (and JUnit 4, so assume it's imported in each case) as I have the most experience with them, but the same concepts are often found in other languages and tools.

<img src="/img/hq/PBMap-travis.png" alt="Parallelized build" title="Parallelized build">

### Android

Android has this splendid list of AndroidX Test libraries. All it takes is to add `testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"` to the app `defaultConfig` in the `build.gradle`. This class is used to run JUnit3 and JUnit4 tests against an Android package (there doesn't seem to be any official support for JUnit5 yet, though some [solutions](https://github.com/mannodermaus/android-junit5) already exist). The runner supports some useful parametrization.
Default usage consists of running `./gradlew connectedAndroidTest`. Oh, and of course the dependencies:

```groovy
androidTestImplementation "androidx.test:core:1.2.0"
androidTestImplementation "androidx.test:runner:1.2.0"
androidTestImplementation "androidx.test.ext:junit:1.1.1"
```

Before looking at the parameters, let's mention another cool part of AndroidX Test which is the filtering package. Out of the box, it comes with some useful annotations like `@SmallTest`, `@MediumTest` and `@LargeTest`. A good practice is to write and annotate your tests following a [Testing Pyramid](https://developer.android.com/training/testing/fundamentals#write-tests) convention. The short unit tests annotated with @SmallTest should be the most numerous accounting for 70% of your tests. Then you should focus on the integration tests (20%) and annotate them with @MediumTest. Lastly, @LargeTest to denote multi-module end-to-end tests.

Don't forget to annotate the test class with `@RunWith(AndroidJUnit4.class)` and each test should also have the normal `@Test` annotation. By the way, if you're wondering what's the difference between *AndroidJUnitRunner* and *AndroidJUnit4* here is a basic overview. The first one is an instrumentation runner used to load the test and app package on the device run the test and report results. It is basically responsible for the testing environment. The latter one is a test class runner, gets 'picked up' by the instrumentation runner to run the tests defined in a class. Android also provides a tool called *Orchestrator*. I won't dwell into it but this basically allows for test isolation. It's useful for clearing all shared state or isolate test crashes. It's good to remember about it in case you might need it in the future.

Having touched the filtering and modules, you can meddle with your test execution in a various ways:
- `./gradlew test` - run local unit tests for whole project;
- `./gradlew connectedAndroidTest` - run instrumented tests on a device for whole project;
- `./gradlew app:test` - run local unit tests for the :app module;
- `./gradlew app:connectedAndroidTest` - run instrumented tests on a device for app module;
- `./gradlew app:connectedVariantNameAndroidTest`-  run instrumented tests on a device for app module and *VariantName* e.g. Debug;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=[small|medium|large]` - run tests annotated with `@SmallTest`, `@MediumTest`, `@LargeTest`;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=small,medium` - run only the tests annotated with `@SmallTest` and `@MediumTest`;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest` - filter out tests with `@FlakyTest` annotation;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.package=<package>` - only from the selected package;
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=<package.class>` - only for the selected class (usefull for test suites).

If you're more hardcore, you can even try [running tests with adb](https://developer.android.com/studio/test/command-line#RunTestsDevice). But that's not the end of nice things. With JUnit4 you can group your tests in proper suites:
```java
package io.github.t3r1jj.pbmap.main;

import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({MapActivitySearchIT.class, ControllerMementoIT.class})
public class ITTestSuite {}
```
With such a set-up you can execute this test suite by passing the class as `android.testInstrumentationRunnerArguments.class=io.github.t3r1jj.pbmap.main.ITTestSuite`. Now this enables us to create a lot of different test configurations. Want to test only core features, execute long running tests, group them in equal sets - no problem, each to his own.

### Java

Now moving to the standard Java stack the mechanism is similar. This time we will use Mave, as it's more popular here from my experience. To create
the *@Small/@Medium/@LargeTest* equivalent we can use the JUnit4 `org.junit.experimental.categories.Category` annotation. As a value of this category,
we can set any number of arbitrary classes, eg.:

```java
package io.github.t3rmian.jmetersamples;

import org.junit.Test;
import org.junit.experimental.categories.Category;

public class JMeterSamplesApplicationTests {

	@Category(SmallTest.class)
	@Test
	public void categorizedTest() {
	}

	@Test
	public void defaultTest() {
	}

}
```

```java
package io.github.t3rmian.jmetersamples;

public interface SmallTest {
}
```

Ok, so we've got our categorized tests, but how do we run only the small tests? This requires some knowledge of Maven but you will catch it easily.
Firstly, for integration tests we will use `maven-failsafe-plugin`, for unit tests, it's recommended to configure `maven-surefire-plugin`. Include the
mentioned plugin in the build phase:
```xml
&lt;build&gt;
	&lt;plugins&gt;
		&lt;plugin&gt;
			&lt;groupId&gt;org.apache.maven.plugins&lt;/groupId&gt;
			&lt;artifactId&gt;maven-failsafe-plugin&lt;/artifactId&gt;
			&lt;version&gt;2.22.2&lt;/version&gt;
			&lt;configuration&gt;
				&lt;groups&gt;${test.groups}&lt;/groups&gt;
			&lt;/configuration&gt;
		&lt;/plugin&gt;
	&lt;/plugins&gt;
&lt;/build&gt;
```

There are a few things worth mentioning here. We use the most recent version to facilitate junit47 provider which supports JUnit4 categories.
Next, we have a unresolvable symbol in the groups configuration. To initialize this property, we will use Maven profile. Let's now define a 
profile, under the project, corresponding to the test category which will be executed:

```xml
&lt;profiles&gt;
	&lt;profile&gt;
		&lt;id&gt;SmallTest&lt;/id&gt;
		&lt;properties&gt;
			&lt;test.groups&gt;io.github.t3rmian.jmetersamples.SmallTest&lt;/test.groups&gt;
		&lt;/properties&gt;
	&lt;/profile&gt;
&lt;/profiles&gt;
```

With such configuration the tests can be run by executing the verify phase with the corresponding profile: `mvnw verify -P SmallTest`.
Not as easy as the Android case, but not too complex, don't you agree? The test suites are created in the same way. Additionally, it's possible
to use `@Categories.IncludeCategory(SmallTest.class)` over the test suite class to include only the selected tests. In a similar way, we have
an options category exclusion.

To target only specific modules add them as a `-pl` or `--projects` parameter (`mvnw -help` will yield you additional info). To run a specific test suite use `mvnw -Dit.test=SpecificTestSuite verify`. For `maven-surefire-plugin` it would be `mvnw -Dtest=SpecificTestSuite test`.

### Summary

That's pretty much it. As you can see, grouping and categorizing your tests isn't too complex and can save you a lot of time later on. If you've yet to use test parallelization with categorization and test suites, I highly encourage you to try it. Especially if your tests are mainly focused on user interface and take a considerable amount of time. Speeding up the test phase can accelerate your delivery process. In effect making your product more agile in a case when some change needs to be quickly developed, verified and delivered.

