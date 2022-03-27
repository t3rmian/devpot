---
title: Repetition of flaky tests
url: flaky-tests-repetition
id: 18
category:
  - testing: Testing
tags:
  - android
  - ci
author: Damian Terlecki
date: 2019-12-01T20:00:00
---

As we go up the hierarchy of tests, we often encounter the problem of test flakiness. The term _flaky_ means that for the same code the test sometimes results in failure but in other cases it's successful. There are many reasons for this. Higher-level tests are generally bigger, require more resources and have potentially more points of failure. They may include some network communication, they might load some large data while your machine invokes a garbage collector. Sometimes they indicate performance problems, in other cases, it's a problem with the environment configuration. Excluding situations where the test is just badly written, there are also a lot of cases when they detect a serious problem occurring once in a blue moon (concurrency) which should, in fact, be reported and fixed.

## Statistics

The more higher-level tests you have, the higher the chances of failed build are. Imagine 10% of your tests are flaky, e.g.: each one of them fails once in 1000 runs. 1 out of 1000, that's like 0.1%! Doesn't sound that bad, does it? Now imagine that the test suite size is 1000, not too small, not too big. So for 100 tests that are nondeterministic, the cumulative probability of having a failed build will be:

<img src="/img/hq/flaky-tests-probability-failed-test.gif" alt="P(FAILED_TEST) = 1/1000" class="img-formula">
<img src="/img/hq/flaky-tests-probability-failed-build.gif" alt="P(SUCCESSFUL_TEST) = P(\Omega) - 1/1000 = 999/1000" class="img-formula">
<img src="/img/hq/flaky-tests-probability-successful-test.gif" alt="P(SUCCESSFUL_BUILD) = P(SUCCESSFUL_TEST_1) ∩ P(SUCCESSFUL_TEST_2) ∩ P(SUCCESSFUL_TEST_3)  ∩  ...  ∩ P(SUCCESSFUL_TEST_N) = (999/1000)^100 ≈ 90%" title="P(SUCCESSFUL_BUILD) = P(SUCCESSFUL_TEST_1) ∩ P(SUCCESSFUL_TEST_2) ∩ P(SUCCESSFUL_TEST_3)  ∩  ...  ∩ P(SUCCESSFUL_TEST_N) = (999/1000)^100 ≈ 90%" class="img-formula">
<img src="/img/hq/flaky-tests-probability-successful-build.gif" alt="P(FAILED_BUILD) = P(\Omega) - P(SUCCESSFUL_BUILD) = 10%" class="img-formula">

Now, this starts looking **unfeasible**. Imagine analyzing logs of every tenth build just to find out there was a connection problem. Though, to see a general picture we would have to analyze a broader range of parameters:
<center>
<table>
<thead>
    <tr>
        <th class="corner-header">🠇 Number of test \<br/>Test failure probability 🠆</th>
        <th>1 / 100 000</th>
        <th>1 / 10 000</th>
        <th>1 / 1 000</th>
        <th>1 / 100</th>
        <th>1 / 10</th>
    </tr>
</thead>
<tbody>
 <tr><td class="th">1</td><td>0%</td><td>0%</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td></tr>
 <tr><td class="th">10</td><td>0%</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td><td class="err">65%</td></tr>
 <tr><td class="th">50</td><td>0%</td><td>0%</td><td class="err">5%</td><td class="err">39%</td><td class="err">99%</td></tr>
 <tr><td class="th">100</td><td>0%</td><td class="warn">1%</td><td class="err">10%</td><td class="err">63%</td><td class="err">100%</td></tr>
 <tr><td class="th">250</td><td>0%</td><td class="warn">2%</td><td class="err">22%</td><td class="err">92%</td><td class="err">100%</td></tr>
 <tr><td class="th">500</td><td>0%</td><td class="err">5%</td><td class="err">39%</td><td class="err">99%</td><td class="err">100%</td></tr>
 <tr><td class="th">1000</td><td class="warn">1%</td><td class="err">10%</td><td class="err">63%</td><td class="err">100%</td><td class="err">100%</td></tr>
 <tr><td class="th">2000</td><td class="warn">2%</td><td class="err">18%</td><td class="err">86%</td><td class="err">100%</td><td class="err">100%</td></tr>
</tbody>
</table>
<b>Probability of failure in the process of verification during CI/CD</b>
</center>

Studying the table we will easily find out some situations in which we will spend more time checking why the build failed than doing something productive.
Of course, we could fix the test, but sometimes we are limited by time (work time/execution time). Another option is to remove the test or ignore the results, but often those tests might still be an added value and give us some **meaningful information**.

The third option, a little cheat, which I incorporated in one of the projects, and might also suit you, is to repeat the flaky test. If we have a test that fails once out of ten times, by repeating it once we should get the failure rate down to 1/100; repeating it two times – to 1/1000. With a base failure rate of 1/100, we will get an even better decrease. In theory, we will drastically move from the right edge of the above table to the left one with a very low failure rate.

## Java and Android

As the flaky tests are the most prevalent in Android I will demonstrate how to implement a test repetition on that platform. 
In the past, this feature was available out-of-the-box when using [@FlakyTest](https://developer.android.com/reference/android/test/FlakyTest.html) annotation.
With the recent introduction of the new testing framework `androidx.test` this option has been removed. Nevertheless, the JUnit which we usually use is a pretty powerful tool and provides us an API allowing us to implement this feature. This also works the same way for the standard Java.

### RetryStatement

Let's start with the core interface. Each part of the test class code (an action) is wrapped in an `org.junit.runners.model.Statement` with `evaluate` method.
This is not only the code written under method with `@Test` annotation, but also code with other annotations like `@BeforeClass` and `@AfterClass`. Therefore,
the first step for implementing our retry feature is to decorate this statement as so:

```java
class RetryStatementDecorator extends Statement {

    private static final String TAG = RetryStatementDecorator.class.getSimpleName();

    private final int tryLimit;
    private final Statement base;
    private final Description description;

    RetryStatementDecorator(Statement base, Description description, int tryLimit) {
        this.base = base;
        this.description = description;
        this.tryLimit = tryLimit;
    }

    @Override
    public void evaluate() throws Throwable {
        Throwable caughtThrowable = null;

        for (int i = 0; i < tryLimit; i++) {
            try {
                base.evaluate();
                return;
            } catch (Throwable t) {
                caughtThrowable = t;
                Log.w(TAG, String.format(Locale.getDefault(), "%s: run %d failed", description.getDisplayName(), (i + 1)));
            }
        }
        Log.w(TAG, String.format(Locale.getDefault(), "%s: giving up after %d failures", description.getDisplayName(), tryLimit));
        //noinspection ConstantConditions
        throw caughtThrowable;
    }

}
```

### RetryTestRule

The next thing which we need to do is to somehow apply this statement to our tests. For sure we could use a `TestRule` interface and implement our own one:

```java
public class RetryRule implements TestRule {

    private int tryLimit;

    public RetryRule(int tryLimit) {
        this.tryLimit = tryLimit;
    }

    public Statement apply(Statement base, Description description) {
        return new RetryStatementDecorator(base, description, tryLimit);
    }

}
```

With an exemplary use inside a test:
```java
    @Rule
    public RuleChain testRule = RuleChain
            .outerRule(new ActivityTestRule<>(MainActivity.class, true, true))
            .around(new ScreenshotOnTestFailedRule());
            .around(new RetryRule());
```

And this will work in many cases, but in general, **only the @Test statement will be retried**. What this means is that the test code will be re-executed for the state of activity after the last failure. Imagine you have a test that opens some kind of menu and searches through it for a specific item. During the retry, the test will fail at opening the menu as it will already be opened. You could of course deal with it one way or the other, but the best way would be to implement the retry at the higher level – at the test runner level.

### RetryRunner

Having come up to this point, the implementation might sound a bit complex, but fear not – it's, in fact, very simple. We want to implement the retry method both at the class block level as well as the method block level. This way each time our test fails, we will get our Activity recreated too. For this, we will extend `AndroidJUnit4ClassRunner`. We could probably use `BlockJUnit4ClassRunner` here instead as it contains everything we need, though, if you check the implementation of `AndroidJUnit4` which is usually used in the case of instrumentation tests, you will see that it loads `androidx.test.internal.runner.junit4.AndroidJUnit4ClassRunner`. In general, I prefer to keep changes minimal.

```java
public class RetryRunner extends AndroidJUnit4ClassRunner {

    public RetryRunner(Class<?> klass) throws InitializationError {
        super(klass);
    }

    @Override
    protected Statement classBlock(RunNotifier notifier) {
        return new RetryStatementDecorator(super.classBlock(notifier), getDescription(), BuildConfig.IT_TEST_TRY_LIMIT);
    }

    @Override
    protected Statement methodBlock(FrameworkMethod method) {
        return new RetryStatementDecorator(super.methodBlock(method), describeChild(method), BuildConfig.IT_TEST_TRY_LIMIT);
    }

}
```

Quite simple isn't it? We reuse the `RetryStatementDecorator` defined before, decorating the statement received from the implementations of the parent classes.
For the retry count I've used a custom debug build config property defined in the Gradle module build:

```gradle
android {
    buildTypes {
        debug {
            it.buildConfigField "int", "IT_TEST_TRY_LIMIT", ("true" == System.getenv("CI") ? 3 : 1).toString()
        }
    }
}
```

Using this runner is as simple as swapping `@RunWith(AndroidJUnit4.class)` with `@RunWith(RetryRunner.class)`. You could also try the option from the `AndroidJUnit4` javadocs:

> This implementation will delegate to the appropriate runner based on the build-system provided value. A custom runner can be provided by specifying the full class name in a 'android.junit.runner' system property.

However, I haven't been successful with this one in Android. I suspect the runner is executed on the device and it's hard to set the values for system parameters there. A `RunnerBuilder` class might also be useful here as it can be passed as a parameter to the [instrumentation runner](https://developer.android.com/reference/android/support/test/runner/AndroidJUnitRunner).

If you run this now for a failing test you should get something like:
```java
2019-12-01 16:15:49.176 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 1 failed
2019-12-01 16:15:51.788 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 2 failed
2019-12-01 16:15:54.053 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): run 3 failed
2019-12-01 16:15:54.054 4818-4834/? W/RetryStatementDecorator: onAboutCreate(io.github.t3r1jj.pbmap.about.AboutActivityIT): giving up after 3 failures
2019-12-01 16:15:54.056 4818-4834/? E/TestRunner: junit.framework.AssertionFailedError
        at junit.framework.Assert.fail(Assert.java:48)
        at junit.framework.Assert.fail(Assert.java:56)
        at io.github.t3r1jj.pbmap.about.AboutActivityIT.onAboutCreate(AboutActivityIT.java:76)
        at java.lang.reflect.Method.invoke(Native Method)
        at org.junit.runners.model.FrameworkMethod$1.runReflectiveCall(FrameworkMethod.java:50)
        at org.junit.internal.runners.model.ReflectiveCallable.run(ReflectiveCallable.java:12)
        at org.junit.runners.model.FrameworkMethod.invokeExplosively(FrameworkMethod.java:47)
        at org.junit.internal.runners.statements.InvokeMethod.evaluate(InvokeMethod.java:17)
        at androidx.test.internal.runner.junit4.statement.RunAfters.evaluate(RunAfters.java:61)
        at org.junit.rules.TestWatcher$1.evaluate(TestWatcher.java:55)
        at androidx.test.rule.ActivityTestRule$ActivityStatement.evaluate(ActivityTestRule.java:531)
        at org.junit.rules.RunRules.evaluate(RunRules.java:20)
        at io.github.t3r1jj.pbmap.testing.RetryStatementDecorator.evaluate(RetryStatementDecorator.java:30)
        at org.junit.runners.ParentRunner.runLeaf(ParentRunner.java:325)
        at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:78)
        at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:57)
        at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
        at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
        at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
        at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
        at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
        at io.github.t3r1jj.pbmap.testing.RetryStatementDecorator.evaluate(RetryStatementDecorator.java:30)
        at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
        at org.junit.runners.Suite.runChild(Suite.java:128)
        at org.junit.runners.Suite.runChild(Suite.java:27)
        at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
        at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
        at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
        at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
        at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
        at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
        at org.junit.runner.JUnitCore.run(JUnitCore.java:137)
        at org.junit.runner.JUnitCore.run(JUnitCore.java:115)
        at androidx.test.internal.runner.TestExecutor.execute(TestExecutor.java:56)
        at androidx.test.runner.AndroidJUnitRunner.onStart(AndroidJUnitRunner.java:392)
        at android.app.Instrumentation$InstrumentationThread.run(Instrumentation.java:2074)
```

### Surefire and Failsafe plugins

If you're using Surefire or Failsafe plugins in your project, the case might be much simpler. These two plugins provide an [API](https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html) allowing you to rerun failed tests (JUnit 4.x):
```bash
mvn -Dsurefire.rerunFailingTestsCount=3 test
```

## Summary

By re-running your flaky tests you can increase the build success rate without having to remove the tests. They might still provide some useful information, though in general, it's a good idea to analyze each case before applying the retry rule. If you're hungry for more information, I recommend [John Micco's](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) and [Jeff Listfield's](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html) posts about test flakiness on Google blog about testing.