---
title: Load testing with JMeter
url: load-testing-with-jmeter
id: 12
category:
  - testing: Testing
tags:
  - jmeter
  - performance
author: Damian Terlecki
date: 2019-09-08T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

JMeter is a great testing tool. It shines especially during load tests. Not only you can test the performance of application or database using different interfaces, but you're able to generate various levels of load by simulating influx of parallel users. Depending on the use case, you might want to test different situation, e.g.:
* the maximum load which the system can withstand;
* which component is the bottleneck:
    - the database;
    - the backend;
    - a specific node in microservices;
    - the frontend;
* whether the system is scalable (vertically/horizontally);
* whether the load balancing works correctly;
* whether the system is optimally configured and optimally scaled across different components.

### Analysis

Before you start preparing the tests, you should analyze how your system is used and what are the most common use cases. It's important to remember about any background tasks and any specific methods, which might be used very seldom, but in combination with load increase, could make your system choke. The next step after defining which interfaces should be tested, and their usage ratio, is to plan the execution sequence and duration. Consider choosing enough time so that the garbage collector will get invoked several times. Some diversity might also be needed to achieve a worst-case situation for the database or your caching layer. Lastly — the number of parallel threads (users) that will hit the system should be planned together with the load increase.

Some side topics which are worth to consider are:
* on what environment will the tests be run:
    - connection;
    - hardware;
    - software;
    - configuration;
    - comparison to the production;
* whether a backup is needed;
* whether one PC will be able to generate enough load;
* whether all people are pre-trained to run the tests and have the necessary access;
* what other tools are necessary for the monitoring purposes (e.g. Zipkin/Kibana/Nagios);
* how the input data will be loaded:
    - from the database during the tests;
    - from the database on the test startup;
    - from the input file;
* what is the actual aim;
* how to analyze the results and what kinds of reports to create.

As you can see, there are a lot of open points which should be clarified during the analysis. A proper plan is essential to get meaningful results which would allow for comparison with future tests.

### Sample implementation

A basic implementation of the load tests include the following steps and elements:
1. Configuring (optionally parametrizing) connection to the interfaces [*Test Plan/User Variables Config/Config Defaults*].
2. Loading input data [*setUp Thread Group*]:
    - from database [*JDBC Config/Sampler*];
    - from CSV file [*CSV Config*].
3. Preparation of test cases that call the interfaces [*Thread Group*]:
    - randomizing input data for a single execution [*CSV Config/JSR223 Pre Processor*];
    - proportionally randomizing which interface to call [*Controllers*];
    - defining additional requirements:
        - number of threads to gather for achieving short peaks [*Timers*];
        - additional interface calls that are expected to happen in the scenario [*Samplers*].
4. Adding an aggregate view for monitoring the test [*Listeners*].

<img src="/img/lazy/jmeter/jmeter-load-tests.jpg" data-src="/img/hq/jmeter/jmeter-load-tests.png" alt="Load Test Plan" title="Load Test Plan">

Note that the simpler the tests are, the faster they will be executed and a bigger load can be generated. Also, by simplifying them, you can decrease the number of possible points of failure. Let's take step 2 as an example. If we decide to connect to the database in our tests we increase the complexity of the tests and dependencies. For example, it's not recommended to store the password to the database inside the tests. You might want to share them for a review, upload to the repository or give them to the people who will execute them during off-hours. Not everyone who has access to them, also have/should have access to the database. It's also possible to provide wrong credentials and lose some time especially when you have a limited time window to execute the tests.

Another issue might occur when you will want to generate a very big load by increasing the number of test plan executions (multiple people/machines). If you don't synchronize the database querying for input data, it's possible that the application will eat all of the database resources (connections). In this case, you might get timeouts during set-up step effectively making the next steps unreliable. So, in such case loading pre-fetched (e.g. a day before) input data is preferred. Though, if you're not pressed on time, you can test things out yourself.

For an exemplary implementation, you can check the sources linked at the bottom of the page. The project has a REST API implemented in Spring and contains some simple load tests. Please read the README for proper set-up (database driver needs to be downloaded and put in the JMeter classpath).

#### JMeter variables scope

In the JMeter variables are scoped per thread. What this means is that if you load the data in the *setUp Thread Group* it will not be accessible to the relevant Thread Groups responsible for calling the interfaces. Of course, you can put the loading logic inside them, but in some situations, this might not be feasible. You might don't want to generate any artificial load on the database during test time. In such a case you can get by with making use of JMeter properties, which are shared between *Thread Groups*. To save the property in the setUp thread use:
- [__setProperty](https://jmeter.apache.org/usermanual/functions.html#__setProperty) function;
- [JSR223 Sampler](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Post Processor and JMeterProperties *props* object with `java.util.Properties` interface — allows saving JDBC result set variables.

Reading these properties is as simple as using:
- [__P](https://jmeter.apache.org/usermanual/functions.html#__P) or [__property](https://jmeter.apache.org/usermanual/functions.html#__property) function;
- [JSR223 Sampler](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Pre Processor and *props* object.

Properties are also used to retrieve parameters passed in the command line with `-J` prefix, e.g. `-Jparameter=value`.

#### Randomizing the data

After sharing the input data, you can randomize it for a single execution and save the necessary information in a variable. It will be later accessible in the same Thread Group using `${variable_name}` syntax and each thread will effectively have a different input.

```groovy
import java.util.Random; 

Random rand = new Random(); 
def index = rand.nextInt(props.get("resultSet").size());
vars.put("id", props.get("resultSet").get(index).get("USER_ID").toString());
```

You might also want to compare other ways to generate random numbers. I've run some performance tests consisting of generating and logging one random integer. Note that they were executed in a lax way and are for quick reference only (10 threads x 100000 repeats):

<table class="rwd">
   <thead>
      <tr>
         <th>Randomizer</th>
         <th>Throughput [execs/sec]</th>
         <th>Note</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Randomizer">
            java.util.Random
         </td>
         <td data-label="Throughput [execs/sec]">
            10900
         </td>
         <td data-label="Note">
            -
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            java.util.concurrent.ThreadLocalRandom
         </td>
         <td data-label="Throughput [execs/sec]">
            11377
         </td>
         <td data-label="Note">
            Similar performance as java.util.Random points that the execution is already thread local in the thread group (no explicit execution in thread pool inside the script)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            org.apache.commons.lang3.RandomUtils
         </td>
         <td data-label="Throughput [execs/sec]">
            <span class="color-ok">11704</span>
         </td>
         <td data-label="Note">
            The fastest by a very small margin (1%)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            <a href="https://jmeter.apache.org/usermanual/functions.html#__Random">__Random</a>
         </td>
         <td data-label="Throughput [execs/sec]">
            <span class="err">5065</span>
         </td>
         <td data-label="Note">
            Twice the slowest
         </td>
      </tr>
    </tbody>
</table>

As you can see, any of the first three methods is a valid choice. I would not recommend using *__Random* as it seems somehow very slow. However, there are other quite handy functions like [__RandomString](https://jmeter.apache.org/usermanual/functions.html#__RandomString), [__RandomDate](https://jmeter.apache.org/usermanual/functions.html#__RandomDate), [__time](https://jmeter.apache.org/usermanual/functions.html#__time), [](https://jmeter.apache.org/usermanual/functions.html#__UUID) and [__threadNum](https://jmeter.apache.org/usermanual/functions.html#__threadNum) for generating dummy data. Groovy code can also be inlined using [__groovy](https://jmeter.apache.org/usermanual/functions.html#__groovy).

### Increasing the load

When parametrizing the load, and the target amount of requests per second you might want to note down some configuration properties of your components under testing. In the case of the database, it's the maximum number of connections. For the servers, it's the number of parallel requests and the size of a queue. Multiply that by the number of nodes and take some overhead into consideration.

As mentioned before, increasing the load is as simple as increasing the number of users. Depending on your machine specification and test implementation, you will be able to set-up around 5000 parallel threads. However, at some point, the overhead of creating additional threads will effectively decrease the performance possibly even freezing the test executing machine. If you have a high-performing multi-node system, it might be not enough to achieve the maximum load limit. Note that it's also hard to estimate the number of interface executions per unit of time, based on the number of users. By default, each thread has to send a request to the interface and wait for a response.

<img class="uml-bg" src="/img/hq/load-tests-client-server-client.svg" alt="Default client - server communication" title="Default client - server communication">

By setting up a response timeout we can effectively skip waiting for a response, and start the next request faster. The flaw of this is that you will lose the possibility of monitoring the responses and their statuses. It's a valid option if you have different tools for monitoring the load. When setting a really low response timeout, I recommend to also leave out one unconfigured thread group for a status check. You might get blocked by some unknown firewall and won't realize it, especially if the monitoring tools don't display online data.

<img class="uml-bg" src="/img/hq/load-tests-client-server.svg" alt="Client - server communication with quick response timeout" title="Client - server communication with quick response timeout">

The last thing to consider is the connection. In the local network, you will usually get pretty low times to reach the server. If the target environment is in the internet or is accessible only through VPN, the tests will be slower, effectively generating lower loads. Finally, don't forget the bandwidth, which is often the limiting factor.

### Summary

JMeter is a nice tool for load testing, however, it must be combined with additional monitoring tools. There are a lot of things to consider to make the tests meaningful. Each matter should be recognized during the preparation. After a successful test run, it's time to analyze and prepare the reports. It's an essential part in defining future steps for meeting or defining the SLA.

Don't forget to check out the sample project. You can play around with the tests finding out the default numbers for Tomcat thread pool, queue size, H2 database connection pool size, and timeout values. Topics like loading data from CSV/database, variables scope and increasing the load are also covered there.