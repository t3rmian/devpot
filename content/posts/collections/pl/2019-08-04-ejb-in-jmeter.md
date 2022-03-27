---
title: Komunikacja z EJB w JMeterze
url: ejb-w-jmeterze
id: 9
category:
- testing: Testy
tags:
  - jmeter
  - ejb
  - jee
author: Damian Terlecki
date: 2019-08-04T20:00:00
---

Podczas implementacji oraz konserwacji aplikacji biznesowych na platformie Java Enterprise (JEE/J2EE/Jakarta EE) może zajść potrzeba ręcznego wywołania metody EJB interfejsu zdalnego. Czynność taka może być potrzebna w wielu sytuacjach. Projekt na przykład może nie być skonfigurowany pod testy integracyjne, gdy nagle zajdzie potrzeba weryfikacji głównych metod używanych przez klientów EJB. W innym przypadku może to być wymagane do testów wydajnościowych. Jednak moim zdaniem, najlepiej pasującym tutaj przypadkiem użycia jest sytuacja, w której mamy pewną metodę, która inicjuje przetwarzanie danych i nie jest ona wystawiona jako interfejs REST-owy/SOAP-owy. W takim kontekście chcielibyśmy ją wywołać w sposób automatyczny (np. na potrzeby testów), omijając interfejs użytkownika.

W JMeterze, aby wywołać metodę EJB trzeba stworzyć [swój własny sampler](https://dzone.com/articles/test-your-ejbs-with-jmeter) (domyślnie JMeter nie zapewnia samplera EJB). Jeśli jednak potrzebujesz czegoś szybkiego i prostego, to cel można osiągnąć przy wykorzystaniu *Samplera JSR223*. Tak czy inaczej, aby zdalnie wywołać metodę interfejsu EJB, potrzebne nam będą biblioteki klienckie oraz biblioteki serwera aplikacyjnego, który udostępnia nasze interfejsy. Umieszczamy je w `JMETER_HOME/lib` lub `JMETER_HOME/lib/ext`. JMeter automatycznie wykryje klasy w tych paczkach ([classpath](https://jmeter.apache.org/usermanual/get-started.html#classpath)) i załaduje je przy starcie.

### Wywoływanie EJB przez zdalnego klienta za pomocą JNDI

Jak wspomniano wcześniej komunikację z interfejsem EJB można przeprowadzić za pomocą *Samplera JSR223*. Do jego stworzenie potrzebna będzie grupa wątków (*Thread Group*). Pod nią możemy dodać omawiany *JSR223 Sampler*. Jeśli chodzi o mnie, to preferuję w tym przypadku użycie języka Groovy, jednak możesz wybrać, co Ci się podoba. Poniżej znajduje się mały kawałek kodu realizujący komunikację. Możesz dostosować go do własnego przypadku.

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

W przypadku, gdy dostęp do adresu JNDI został zabezpieczony, możliwe jest skonfigurowanie obiektu `InitialContext` z parametrami dostępowymi. Dla wygody można również użyć klasy `Environment` z biblioteki WebLogic. W przypadku innych serwerów warto poszukać odpowiednika bądź po prostu użyć standardowego sposobu z `Properties`/`Hashtable` i odpowiednimi kluczami parametrów. Poniżej zamieściłem przykład. Pamiętaj, że dobrą praktyką jest zamknięcie kontekstu (który wewnętrznie zamyka połączenie ze zdalnym serwerem), po zakończeniu wywoływania EJB, zamiast oczekiwania na zamknięcie lub automatyczną dealokację (ang. garbage collection*)

```groovy
weblogic.jndi.Environment environment = new weblogic.jndi.Environment();
environment.setInitialContextFactory(weblogic.jndi.Environment.DEFAULT_INITIAL_CONTEXT_FACTORY); /* env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory"); */
environment.setProviderURL("t3://localhost:7001"); /* env.put(Context.PROVIDER_URL, "t3://localhost:7301"); */
environment.setSecurityPrincipal("guest"); /* env.put(Context.SECURITY_PRINCIPAL, "guest"); */
environment.setSecurityCrendentials("guest"); /* env.put(Context.SECURITY_CREDENTIALS, "guest"); */
InitialContext ctx = environment.getInitialContext();
```

Powyższy przykład przedstawia wywołanie metody EJB na serwerze WebLogic poprzez zdalnego klienta. W tym przypadku komunikacja RMI (ang. Remote Method Invocation) odbywa się przy użyciu własnościowego protokołu **T3**. Będzie się to różnić dla innych serwerów aplikacyjnych. Na przykład WildFly w wersji < 8 używa protokołu **jnp**, w nowszych — [http remoting](https://docs.jboss.org/author/display/WFLY10/Remote+EJB+invocations+via+JNDI+-+EJB+client+API+or+remote-naming+project), a od wersji 11 [metody EJB mogą być wywoływane poprzez HTTP](https://docs.jboss.org/author/display/WFLY/EJB+over+HTTP).