---
title: JMeter — introduction
url: jmeter-introduction
id: 4
tags:
  - jmeter
  - testing
author: Damian Terlecki
date: 2019-06-02T20:00:00
---

JMeter is an open source Java tool that is often used for performance testing to determine system's behaviour under heavy load situations. Although, this is the main purpose of JMeter, it can actually be utilized for running most of the system test like:
- functionality tests;
- performance tests;
- load and stability tests;
- scalability tests;
- regression tests.

<img class="uml-bg" src="/img/hq/system-testing.png" alt="Testing phases" title="Testing levels">

System testing is done after unit and integration testing, but before acceptance tests. It is usually the last step carried out by the development/testing team. You could argue, that you don't need an extra tool for system testing — and that might bet true in your case. You could just write some tests during development in the integration level with fully integrated modules — and this might work too. However, there are a lot of cases, when it would be hard to check every requirement without any tricks.

This is where JMeter shines — you get a tool especially prepared for these kinds of tests. Firstly, you can easily configure desired number of users (threads) for your tests. To do this, click on *Test Plan* with RMB and choose the option from *Add* list. If you require more — you can also define startup delays, ramp-up periods and choose what to do when sampler (similar to a single test) fails. For each thread a number of samplers can be chosen:
- **HTTP Sampler — imitate user visiting a site, test REST or SOAP web services;**
- **JDBC Sampler — connect to a database to verify the data or execute DML queries (requires *JDBC Connection Configuration* element);**
- JSR223 Sampler — use scripting (Groovy/BeanShell/JavaScript/…) for the Java Platform;
- SMTP and Mail Reader Samplers — test SMTP server or verify if the email has been delivered;
- JMS Samplers;
- TCP Sampler;
- FTP Request;
- JUnit Request;
- …

For each sampler you can add (RMB->*Add*) various types of assertions which can verify the data:
- Response Assertion — default verification of response (headers/body/status) with RegEx capabilities;
- JSON Assertion — verifies JSON response data using JSON Path and optional RegEx;
- JSR223 Assertion — uses scripting language for verification;
- XPath Assertion — similar to JSON Path but for XML;
- …

Small test cases should utilize the GUI Assertions. For more complex problems, if you're a developer, you will probably be most efficient with *JSR223 Assertion* (aside from JMeter clunkiness and limited debug options). Otherwise, I suggest restructuring test plans with *Logic Controllers* (if/while/for) and *Post Processors* (extractors). *Pre* and *Post Processors* can be used for a selected sampler to execute logic before and after sampler execution.

The remaining things that are in JMeter out of the box are *Timers, Config Elements and Listener*. The former ones provide an easy way to manage the time — stop threads, pause them for grouping or delay to reach expected throughput. Configuration elements can be used to define parameters, counters, defaults for requests and connection configurations. Listeners provide a way to visualize test results.

Finally, a few things which you will probably use the post while developing the tests are:
- Debug Samplers and Debug Post Processors — provide sampler input and output logs together with variable values;
- View Results Tree (*Listener*) — to see the results of the tests, together with logs;
- Summary or Aggregate Report (*Listeners*) — performance test stats output;
- User Parameters (*Pre Processor*) or User Defined Variables (*Config Element*) — to define parameters (use `${param_name}` syntax to get the parameter value) or variables.

On top of that, if you really need some more advanced features, you can install [numerous custom plugins](https://jmeter-plugins.org/) or [write your own one](https://jmeter.apache.org/usermanual/jmeter_tutorial.html). JMeter tests can be run manually or configured to be run in your CI/automation tool and target multiple environments. This approach provides a slightly different and sometimes very useful way of verifying the consistency of your system across different versions or under different settings.