---
title: Test suites and categorization
url: test-suites-categorization
id: 15
tags:
  - testing
  - android
  - java
author: Damian Terlecki
date: 2019-10-20T20:00:00
---

Writing automated tests might be considered a boring chore by many people. Nevertheless, everyone will agree, that a decent coverage will yield you a lot of saved time later on. Especially as the team members might change over time, and it might be hard to predict the consequences of even small changes for the newcomers.

Why would you want to consider creating test suites?

# Tests take too much time

This is not a problem in case of unit tests. Integration verification might come to your mind, but it's often not the case either. Surely, it takes more time
to initialize some module, service or test database, than to test a few isolated lines in the code. The main culprit here are the end to end tests and user interface tests. You might say that you don't need them, but often they are crucial and can expose some unwanted behavior. These tests usually take longer time
as in each step, the application has to load all necessary resources and display them to the user (test engine)

# Parallelize why examples
# Flaky tests
# Faster
# Priority and use cases
# pressed on time

<img src="/img/hq/PBMap-travis.png" alt="Parallelized build" title="Parallelized build">

### Android

Android has this splendid list of AndroidX Test libraries. All it takes is to add `testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"` to the app `defaultConfig` in the `build.gradle`. This class is used to run JUnit3 and JUnit4 tests agains an Android package (there doesn't seem to be any official support fot JUnit5 yet, though some [solutions](https://github.com/mannodermaus/android-junit5) already exist). The runner supports some useful parametrization.
Default usage consists of running `./gradlew connectedAndroidTest`. Oh, and of course the dependencies:

```groovy
    androidTestImplementation "androidx.test:core:1.2.0"
    androidTestImplementation "androidx.test:runner:1.2.0"
    androidTestImplementation "androidx.test.ext:junit:1.1.1"
```

Before looking at the parameters, let's mention another cool part of AndroidX Test which is the filtering package. Out of the box it comes with some useful annotations like: `@SmallTest`, `@MediumTest` and `@LargeTest`. A good practice is to write and annotate your tests following a [Testing Pyramid](https://developer.android.com/training/testing/fundamentals#write-tests) convention. The short unit tests annotated with @SmallTest should be the most numerous accounting for 70% of your tests. Then you should focus on the integration tests (20%) and annotate them with @MediumTest. Lastly, @LargeTest to denote multi-module end-to-end tests.

Don't forget to annotate the test class with `@RunWith(AndroidJUnit4.class)` and each test should also have the normal `@Test` annotation. By the way, if you're wonder what's the difference between *AndroidJUnitRunner* and *AndroidJUnit4* here is a basic overview. The first one is an instrumentation runner used to load the test and app package on the device run the test and report results. It is basically responsible for the testing environment. The latter one is a test class runner, gets 'picked up' by the instrumentation runner to run the tests defined in a class. Android also provides a tool called *Orchestrator*. I won't dwell into it but this basically allows for test isolation. It's be useful to clear all shared state or isolate test crashes. It's good to remember about it in case you might need it in the future.

Having touched the filtering and modules, you can meddle with your test execution in a various ways:
- `./gradlew test`
- `./gradlew connectedAndroidTest`
- `./gradlew app:test`
- `./gradlew app:connectedAndroidTest`
- `./gradlew app:test`
- `./gradlew app:connectedAndroidTest`
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=[small|medium|large]`
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.size=small,medium`
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest`
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.package=<package>`
- `./gradlew app:connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=<package.class>`

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
Firstly, for integration tests we will use `maven-failsafe-plugin`, for unit tests it's recommended to configure maven-surefire-plugin. Include the
mentioned plugin in the build phase:
```maven
	<build>
		<plugins>
			<plugin>
				<groupId>org.apache.maven.plugins</groupId>
				<artifactId>maven-failsafe-plugin</artifactId>
				<version>2.22.2</version>
				<configuration>
					<groups>${test.groups}</groups>
				</configuration>
			</plugin>
		</plugins>
	</build>
```

There are a few things worth mentioning here. We use the most recent version to facilitate junit47 provider which supports JUnit4 categories.
Next, we have a unresolvable symbol in the groups configuration. To initialize this property, we will use Maven profile. Let's now define a 
profile, under the project, corresponding to the test category which will be executed:

```maven
	<profiles>
		<profile>
			<id>SmallTest</id>
			<properties>
				<test.groups>io.github.t3rmian.jmetersamples.SmallTest</test.groups>
			</properties>
		</profile>
	</profiles>
```

With such configuration the tests can be run by executing the verify phase with the corresponding profile: `mvnw verify -P SmallTest`.
Not as easy as Android case, but not too complex, don't you agree? The test suites are created in the same way. Additionally it's possible
to use `@Categories.IncludeCategory(SmallTest.class)` over the test suite class to include only the selected tests. In similar way we have
an options category exclusion.

To run a specific test suite use `mvnw -Dit.test=SpecificTestSuite verify`. For `maven-surefire-plugin` it would be `mvnw -Dtest=SpecificTestSuite test`

# Summary

That's pretty much it. As you can see, grouping and categorizing your tests isn't too complex and can save you a lot of time later on.
You can...


