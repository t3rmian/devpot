---
title: WebLogic referencja do Data Source z poziomu klienta
url: weblogic-referencja-do-data-source-z-poziomu-klienta
id: 65
category:
- jee: JEE
tags:
  - weblogic
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

Tworząc aplikację w technologii EJB na serwery WebLogic, dostęp do bazy danych realizowany jest zazwyczaj przez ziarna EJB.
Czasami jednak z poziomu klienta SE potrzebować możemy bezpośredniego dostępu do bazy, np. do weryfikacji testów integracyjnych czy systemowych.

Podstawowym elementem umożliwiającym połączenie z bazą jest Data Source konfigurowany na WebLogicu.
Do źródła danych zawsze możemy znaleźć referencję poprzez InitialContext bądź adnotację @Resource (zakładając, że jesteśmy w zarządzanym przez kontener ziarnie).

## WebLogic 12.x client DataSource

Z kolei, aby uzyskać referencję do DataSource zarządzanego przez serwer WebLogic 12.x z poziomu klienta, potrzebować będziemy biblioteki *wlfullclient.jar*.
Biblioteki tej standardowo nie znajdziemy w repozytorium mavenowym, a musimy ją zbudować na własną rękę, mając do dyspozycji instalację WebLogica.
Jak zbudować bibliotekę opisuje [ dokumentacja](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D):
1. Odnalezienie folderu `WL_HOME/server/lib`.
2. Zbudowanie biblioteki: `java -jar wljarbuilder.jar`.
3. Dodanie biblioteki do classpath. Pomijając zabawę parametrami, możemy zainstalować ją w lokalnym repozytorium i dodać do zależności:
```bash
mvn install:install-file -Dfile=wlfullclient.jar -DgroupId=com.oracle -DartifactId=wlfullclient -Dversion=12.2.1.4 -Dpackaging=jar
```
```xml
<dependency>
    <groupId>com.oracle</groupId>
    <artifactId>wlfullclient</artifactId>
    <version>12.2.1.4</version>
    <scope>test</scope>
</dependency>
```

Jeśli nie potrzebujemy stubów takich jak właśnie DataSource, a zadowala nas podstawowa komunikacja z EJB, możemy skorzystać z biblioteki *wlthint3client.jar* zawartej w tym samym katalogu.
Pozyskanie referencji wygląda dosyć standardowo i odbywa się za pomocą InitialContext. Jak fabrykę kontekstu podajemy fabrykę specyficzną dla WebLogica.
Jej klasa znajduje się właśnie w dołączonej bibliotece.

```java
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Properties;

import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.Assert.assertTrue;

public class DatabaseIT {
    private final InitialContext context;
    private final DataSource dataSource;
    private final MyEjbService service;

    public DatabaseIT() throws NamingException {
        Properties env = new Properties();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "weblogic.jndi.WLInitialContextFactory");
        env.put(Context.PROVIDER_URL, "t3://localhost:7001");
        context = new InitialContext(env);
        dataSource = (DataSource) context.lookup("my.datasource.jndi");
        service = (MyEjbService) context.lookup("my.ejb.service.jndi");
    }

    @Test
    public void testConnection() throws SQLException {
        service.foo();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM DUAL");
             ResultSet resultSet = statement.executeQuery()) {
            assertTrue(resultSet.next());
            assertThat(resultSet.getString(1), equalTo("X"));
        }
    }
}
```

Nasz test integracyjny, a właściwie można powiedzieć systemowy, powinien zakończyć się powodzeniem.
Właściwą Tobie nazwę JNDI znajdziesz w konsoli WebLogica, odnajdując konfigurację połączenia w drzewku *Services -> Data Sources*:

<img src="/img/hq/wlfullclient-test.png" alt="DataSource JNDI" title="DataSource JNDI">

Bez biblioteki *wlfullclient.jar* nie powinniśmy być zaskoczeni poniższym błędem przy próbie pozyskania referencji do DataSource:
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

Natomiast bez żadnej biblioteki klienckiej nie zainicjalizujemy kontekstu ze względu na brak *weblogic.jndi.WLInitialContextFactory*:
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## WebLogic 14.x client DataSource

Biblioteka *wlfullclient.jar* została oznaczona jako **deprecated** już w wersji 12.2.1.3.
W wersji 14.1.1.0 nie znajdziemy też paczki *wljarbuilder.jar*, więc nie zbudujemy *wlfullclient.jar*.
Możemy skorzystać z paczki *wlfullclient.jar* zbudowanej z jednej z poprzednich wersji i liczyć na wystarczającą kompatybilność z wersją 14.1.1.0.

Przykładowo używająć paczek z wersji 12.2.1.3 bądź 12.2.1.4 nasz test przejdzie bez problemu, ale przy 12.1.3 otrzymamy już błąd podczas samej inicjalizacji kontekstu:
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

Bardziej kompatybilne rozwiązanie obejmuje dodanie bibliotek zawierających szukane klasy znajdujących się w katalogu *WL_HOME/modules*.
To między innymi z tego katalogu *wljarbuilder.jar* buduje *wlfullclient.jar* w poprzednich wersjach.
Do odnalezienia potrzebnych klas możemy użyć następującego polecenia:
```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- szukaną klasę znajdziemy w *WL_HOME/modules/com.bea.core.datasource6.jar*.

Po nitce to kłębka znajdziemy też kolejne klasy potrzebne do udanego testu:
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

Te 3 paczki oraz *wlthint3client.jar* pozwolą na uzyskanie referencji do DataSource zarządzanego przez serwer WebLogic 14.1.1.0 z poziomu klienta Javy SE, oraz wykonanie zapytania na bazie.
Jeśli Twój kontener wymaga uwierzytelnionego połączenia, nie zapomnij ustawić poświadczeń za pomocą właściwości `Context.SECURITY_PRINCIPAL` i `Context.SECURITY_CREDENTIALS` przy tworzeniu InitialContext.