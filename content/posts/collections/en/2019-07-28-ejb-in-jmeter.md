---
title: Calling EJB in JMeter
url: ejb-in-jmeter
id: 9
tags:
  - jmeter
  - ejb
  - jee
author: Damian Terlecki
date: 2019-07-28T20:00:00
---

During the development and maintenance of Java enterprise applications, you might come across a need of executing some remote EJB interface methods. This desire may unfold in many cases. One possible scenario is that the project configuration is not prepared for integration testing and there is an immediate requirement of validating some core methods used by EJB clients. In other cases, you might want to do some performance testing. However, in my opinion, the best matching use case for this is a situation, where you have some trigger-method for invoking data processing which is not exposed in typical REST/SOAP interface, and you need to invoke it in an automated way, bypassing user interface.

In the JMeter, to invoke EJB methods you would have to create [your own sampler](https://dzone.com/articles/test-your-ejbs-with-jmeter) (by default the JMeter does not provide an EJB sampler). Though, if you need something quick and simple it's doable with *JSR223 Sampler*. Either way, to call EJB from you will need client libraries from an application server that hosts your EJB, and your remote interfaces. Put them in `JMETER_HOME/lib` or `JMETER_HOME/lib/ext`. JMeter will automatically pick up classes from these jars ([classpath](https://jmeter.apache.org/usermanual/get-started.html#classpath)) and load them at the start.

### Invoking EJB from a remote client using JNDI

As mentioned before, the EJB invocation can be achieved in a simple JSR223 Sampler. I prefer using Groovy for this but you can use whatever you like. Here is a small piece of code which you would want to edit to your needs:

```groovy
import java.io.Serializable;
import java.rmi.RemoteException;
import java.util.Hashtable;
import javax.ejb.CreateException;
import javax.naming.*;
import javax.rmi.*;

import com.example.DemoEJBRemote;

def env = new Hashtable<String, String>();
env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory");
env.put(Context.PROVIDER_URL, "t3://localhost:7001");
def ctx = new InitialContext(env);
DemoEJBRemote ejb = PortableRemoteObject.narrow(ctx.lookup(DemoEJBRemote.JNDI_NAME), DemoEJBRemote.class);
ejb.foo();
```

Note that it is considered a good practice to close the context (which internally closes the connection to the remote server), after we're done with calling the EJB, instead of waiting for shutdown or garbage collection. In a case that the access to the JNDI has been secured, it's possible to set up the `InitialContext` object with security context (principal and credentials). For convenience, you can also use a WebLogic `Environment` class instead of `Properties`/`Hashtable`:

```groovy
weblogic.jndi.Environment environment = new weblogic.jndi.Environment();
environment.setInitialContextFactory(weblogic.jndi.Environment.DEFAULT_INITIAL_CONTEXT_FACTORY); /* env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory"); */
environment.setProviderURL("t3://localhost:7001"); /* env.put(Context.PROVIDER_URL, "t3://localhost:7301"); */
environment.setSecurityPrincipal("guest"); /* env.put(Context.SECURITY_PRINCIPAL, "guest"); */
environment.setSecurityCrendentials("guest"); /* env.put(Context.SECURITY_CREDENTIALS, "guest"); */
InitialContext ctx = environment.getInitialContext();
```

The above sample presents execution of EJB method on the WebLogic server using a remote client. In this case, RMI communication is done using a proprietary protocol called T3 protocol. This can vary for other application servers. For example in WildFly versions < 8, **jnp** had been utilized, which has been later switched to [http remoting](https://docs.jboss.org/author/display/WFLY10/Remote+EJB+invocations+via+JNDI+-+EJB+client+API+or+remote-naming+project), and starting from the version 11, [EJBs can be invoked over HTTP](https://docs.jboss.org/author/display/WFLY/EJB+over+HTTP).
