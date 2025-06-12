---
title: Lookup de Data Source en cliente WebLogic
url: weblogic-client-data-source-lookup
id: 65
category:
- jee: JEE
  # "JEE" se mantiene como término estándar
tags:
  - weblogic
  # "weblogic" se mantiene igual
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

Al crear una aplicación EJB para servidores WebLogic, el acceso a la base de datos suele hacerse a través de los beans EJB. Sin embargo, desde el punto de vista de un cliente SE, a veces necesitamos acceso directo a la base de datos, por ejemplo, para pruebas de sistema o integración.

El elemento básico que proporciona la conexión es el Data Source configurado en WebLogic. Siempre podemos encontrar una referencia al Data Source vía InitialContext o la anotación `@Resource`, suponiendo que estamos en un entorno gestionado por el contenedor.

## DataSource en cliente WebLogic 12.x

Para obtener una referencia al DataSource gestionado por WebLogic 12.x desde el cliente, hay algunos requisitos adicionales. Necesitaremos la librería *wlfullclient.jar*. Por defecto, esta librería no está en el repositorio Maven y hay que construirla manualmente desde el directorio de instalación de WebLogic. El proceso está descrito en [la documentación](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D):
1. Busca el directorio `WL_HOME/server/lib`.
2. Construye la librería: `java -jar wljarbuilder.jar`.
3. Añádela al classpath. Además de usar el parámetro `-cp`, podemos instalarla en un repositorio local y añadirla como dependencia Maven:
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

Si no necesitas stubs como DataSource y te basta con la comunicación EJB básica, puedes usar la librería *wlthint3client.jar* del mismo directorio. Obtener la referencia es estándar y se hace mediante InitialContext. Como factory de contexto, se especifica una factory específica de WebLogic, incluida en las librerías adjuntas.

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

Nuestra prueba de integración (o de sistema) debería finalizar correctamente. El nombre JNDI correcto puede encontrarse en la consola de WebLogic, en la configuración de la conexión bajo *Services -> Data Sources*:

<img src="/img/hq/wlfullclient-test.png" alt="DataSource JNDI" title="DataSource JNDI">

Sin la librería *wlfullclient.jar*, no debería sorprendernos el siguiente error al intentar obtener la referencia al DataSource:
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

Además, sin ninguna librería cliente, no se inicializará el contexto por falta de *weblogic.jndi.WLInitialContextFactory*:
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## DataSource en cliente WebLogic 14.x

La librería *wlfullclient.jar* ya estaba **deprecada** en la versión 12.2.1.3. En la versión 14.1.1.0 ya no encontraremos *wljarbuilder.jar*, por lo que no podremos construir *wlfullclient.jar* más. Podemos usar el paquete *wlfullclient.jar* construido de una versión anterior y esperar compatibilidad no documentada con la 14.1.1.0.

Por ejemplo, usando los paquetes de las versiones 12.2.1.3 o 12.2.1.4, la prueba pasará sin problema, pero con 12.1.3 obtendremos un error al inicializar el contexto:
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

Una solución más compatible es buscar las librerías necesarias en el directorio *WL_HOME/modules*. Es de este directorio de donde *wljarbuilder.jar* construía *wlfullclient.jar* en versiones anteriores. Podemos usar el siguiente comando para encontrar las clases necesarias:

```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- La clase DataSource se encuentra en *WL_HOME/modules/com.bea.core.datasource6.jar*.

Siguiendo los rastros de los nuevos stacktraces, encontraremos las clases que faltan:
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

Estos 3 paquetes y *wlthint3client.jar* te permitirán obtener una referencia a un DataSource gestionado por WebLogic 14.1.1.0 desde el cliente (Java SE) y consultar la base de datos correctamente. Si tu contenedor requiere conexión autenticada, no olvides configurar las credenciales mediante las propiedades `Context.SECURITY_PRINCIPAL` y `Context.SECURITY_CREDENTIALS` de InitialContext.
