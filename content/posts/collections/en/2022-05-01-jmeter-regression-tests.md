---
title: Simple web-service regression test with JMeter
url: jmeter-web-service-regression-test
id: 85
category:
  - testing: Testing
tags:
  - jmeter
  - web services
author: Damian Terlecki
date: 2022-05-01T20:00:00
source: https://gist.github.com/t3rmian/293a8933ed0952cb47e22328a5c3ffc0
---

Out of the box, JMeter comes with a lot of powerful samplers that allow us to write one test plan and run it across different environments.
Getting the input data that can differ between the environments directly from the database greatly simplifies preparing the test cases.

With the lack of some IntelliSense, getting fluent with the JMeter will take some time. You can, however, create quite a simple
test that, in many cases, will bring you a lot of value. I will show you how to prepare a test that will detect regression in
the read endpoints of a web service.

<img src="/img/hq/jmeter-regression-tests/jmeter-regression-test.png" alt="JMeter Test Plan" title="JMeter Test Plan">

### Regression in versioned API

In its simplest form, you can look for a regression by comparing the web service responses of the same resource id.
For this, you will need some input data. Most often, you will feed this data through the user variables on the Test Plan, CSV file configuration element, or
JDBC/HTTP sampler.

<figure class="flex">
<img src="/img/hq/jmeter-regression-tests/jmeter-test-plan.png" alt="JMeter User Variables" title="JMeter User Variables">
<img src="/img/hq/jmeter-regression-tests/jmeter-jdbc-sampler.png" alt="JMeter JDBC Sampler" title="JMeter JDBC Sampler">
</figure>

Having the input data, simply add the ForEach controller and two HTTP samplers for both versions of the API endpoint.
Under the first sampler, I add a Response Assertion that disables the status check. This allows me to disregard the
response status and later rely on my own assertions. With a Regular Expression Extractor, I extract response data into a variable.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-foreach-controller.png" alt="JMeter ForEach Controller" title="JMeter ForEach Controller">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regex.png" alt="JMeter Expression Extractor" title="JMeter Expression Extractor">
</figure>

Under the second sampler, I reuse a Response Assertion and compare the second response with the variable from the first sampler.
This helps me detect any changes in the responses between two versions of the same endpoint. In the View Results Tree, I can quickly check
the failed assertions.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-response-assertion.png" alt="JMeter Response Assertion" title="JMeter Response Assertion">

Not all differences are regressions. This test is valid for performance optimizations. For functional changes, you may want to make some adjustments 
to match your requirements. Verify response code instead of the data, change the scope of REGEX or use JSON Extractor to
compare relevant parts of the response.

### Regression in a non-versioned API

Another approach you can use is to compare the sampler results saved to a file. This is especially handy when:
- you have a non-versioned API;
- when your changes are deployed behind some internal flags
- when you simply want to detect regressions despite no external changes to the endpoint.

The test plan for this is plain simple if you do not need to post-process the response. Use the View Results Tree to save initial results to the file.
Next, invoke it again after a deployment or toggling the flag and diff both files.

If you want to achieve the same extraction logic, use a simple JSR223 sampler. In the script display the extracted response through `vars["responseV1"]` line,
and add a View Results Tree under this sampler.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-save-results-tree.png" alt="JMeter View Results Tree" title="JMeter View Results Tree">

To diff the contents, run the thread groups consecutively (Test Plan level) so that the file is saved in one thread group and verified in another one.
Running the diff is as easy as using the OS Process Sampler `diff` command on both files. With this option, do not forget to configure the expected return code.
Otherwise, an OS-independent route includes any
other sampler (e.g. a Debug Sampler) with:
- two User Parameters preprocessors extracting the file contents to a variable: `${__FileToString(testResults1.xml)}`;
- the Response Assertion that compares both variables.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-os-process-sampler.png" alt="JMeter OS Process Sampler" title="JMeter OS Process Sampler">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-user-parameters.png" alt="JMeter User Parameters" title="JMeter User Parameters">
</figure>

The described plan was run on JMeter 5.4.3 with responses stubbed by `jwebserver` from Java 18.
You will find relevant source files at the bottom of the page. 
Feel free to use them as a starting point for your own regression tests.
