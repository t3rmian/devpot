---
title: Thread sleep in JEE
url: thread-sleep-jee
id: 119
category:
  - jee: JEE
tags:
  - threads
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

The `Thread.sleep()` method, though seemingly simple way to introduce an artificial delay, its use is [generally discouraged in JEE](https://www.oracle.com/java/technologies/restriction.html#threads)
environment. It directly
manages thread scheduling, a task that should be handled by the application server's container. This interference can
disrupt the container's ability to optimize resource allocation and thread management, leading to performance
degradation and potential bottlenecks. In high-traffic scenarios, container may run out of free threads, resulting in
delays or failures in receiving a request.

## Timer Service

A JEE-compliant alternative to the `Thread.sleep` is the `TimerService`.
It is a set of APIs that allows developers to schedule tasks to be executed
at specific times, delays or intervals.

<img src="/img/hq/thread-sleep-jee.png" alt="Results of running sample TimerService as an alternative to Thread.sleep() in JEE" title="Results of console output when running sample TimerService">

To use timer services, you should inject the `TimerService` interface resource into your enterprise bean. Then use the
`createTimer()` method to create a timer and specify the desired execution time or schedule. Finally, a method annotated with the
`@Timeout` annotation will implement the work that has to be run after a specific delay.

When calling the `createTimer()` method, you can provide a `Serializable` parameter to be retrieved from the `Timer`
parameter in the `@Timeout` annotated method by invoking `getInfo()`. This way you can pass the progress of your work.

Here is an example of a `foo()` and `bar()` method with a delay of 5 seconds in-between:

```java
import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.ejb.Timeout;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Stateless
public class MyEJB {
    public static class MyTimerInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private final LocalDateTime startDateTime;
        private final LocalDateTime fooEndDateTime;

        public MyTimerInfo(LocalDateTime startDateTime, LocalDateTime fooEndDate) {
            this.startDateTime = startDateTime;
            this.fooEndDateTime = fooEndDate;
        }
    }

    @Resource
    private TimerService timerService;

    public void runFooBar() {
        LocalDateTime workStartDate = LocalDateTime.now();
        System.out.println("Starting foo() at " + workStartDate);
        foo();
        LocalDateTime fooEndDate = LocalDateTime.now();
        System.out.println("Ended foo() at " + fooEndDate);
        long delay = TimeUnit.SECONDS.toMillis(5);
        timerService.createTimer(delay, new MyTimerInfo(workStartDate, fooEndDate));
    }

    @Timeout
    public void onTimeout(Timer timer) {
        if (timer.getInfo() instanceof MyTimerInfo) {
            MyTimerInfo myTimerInfo = (MyTimerInfo) timer.getInfo();
            LocalDateTime barStartDateTime = LocalDateTime.now();
            System.out.println("Starting bar() at " + barStartDateTime);
            bar(myTimerInfo);
            LocalDateTime workEndDateTime = LocalDateTime.now();
            System.out.println("Ended bar() at " + workEndDateTime);
            System.out.printf("Total time for foo[%sms] + delay[%sms] + bar[%sms] = %sms%n",
                    Duration.between(myTimerInfo.startDateTime, myTimerInfo.fooEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.fooEndDateTime, barStartDateTime).toMillis(),
                    Duration.between(barStartDateTime, workEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.startDateTime, workEndDateTime).toMillis());
        } else {
            System.err.println("Unknown timer config");
        }
    }

    public void foo() {/***/} // This could return tracking id
    public void bar(MyTimerInfo workProgress) {/***/}
}
```

In addition to `createTimer()`, there are more self-describing methods such as `createSingleActionTimer()`, `createIntervalTimer()` and `createCalendarTimer()`.
Their API expects a `Serializable` parameter optionally wrapped in a `TimerConfig` object that provides a way to
change the `persistent` option (by default true). It's a way to extend a timer's lifetime beyond the current JVM instance.

Do note that for the `@Timeout`-annotated methods, there are two significant constraints:
> The EJB specification only allows the `RequiresNew` (default) or `NotSupported` transaction attributes to be specified for this method.

> The timeout method must not throw application exceptions.

Additionally, I found that the container may not invoke the interceptors on the `@Timeout` method invocation on the WebLogic.
Watch out for this and other similar container features of your provider.

## Summary

The JEE-compliant alternative for the `Thread.sleep` can be the injected `TimerService` resource and a `@Timeout` method.
Fundamentally, it requires splitting the code into at least two parts, which is less trivial the deeper you are in the
call hierarchy and the more atomic your process is required to be.

The asynchronous nature may also require a different communication flow. If it is a user that awaits the result of such operation, you must
think about the feedback mechanism (e.g., provide an immediate, queryable tracking identificator).

Because of the (change) complexity, it's often optimal to balance out
the possibility of `Thread.sleep` impeding container resource management in high-traffic scenarios against the
additional work and maintenance required from an asynchronous model.
Ultimately, it is best to implement a good framework for this type of processes to reduce cognitive complexity and separate responsibilities.