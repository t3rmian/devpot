---
title: Busca de Data Source no cliente WebLogic
url: weblogic-busca-datasource-cliente
id: 65
category:
- jee: JEE
tags:
  - weblogic
author: Damian Terlecki
date: 2021-05-02T20:00:00
---

Ao criar uma aplicação em tecnologia EJB para servidores WebLogic, o acesso ao banco de dados geralmente é realizado através dos beans EJB. No entanto, às vezes, do ponto de vista do cliente SE (Standard Edition), podemos precisar de acesso direto ao banco de dados, por exemplo, para verificar nosso sistema ou para testes de integração.

O elemento básico que fornece a conexão ao banco de dados é o Data Source configurado no WebLogic. Podemos sempre encontrar uma referência ao Data Source via InitialContext ou a anotação `@Resource`, assumindo que estamos em um ambiente gerenciado por contêiner.

## DataSource do cliente WebLogic 12.x

No entanto, para obter uma referência ao DataSource gerenciado pelo servidor WebLogic 12.x a partir do nível do cliente, existem alguns pré-requisitos adicionais. Precisaremos da biblioteca *wlfullclient.jar*. Por padrão, esta biblioteca não pode ser encontrada no repositório Maven, e temos que construí-la por conta própria, a partir do diretório de instalação do WebLogic. Como construir a biblioteca está descrito na [documentação](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/t3.html#SACLT-GUID-54815E72-9837-4353-86BB-EA554C9A804D):
1. Encontre o diretório `WL_HOME/server/lib`.
2. Construa a biblioteca: `java -jar wljarbuilder.jar`.
3. Adicione a biblioteca ao classpath. Além de brincar com os parâmetros `-cp`, podemos instalá-la em um repositório local e adicioná-la às dependências do Maven:
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

Se você não precisar de stubs como DataSource e estiver satisfeito com a comunicação básica EJB, pode usar a biblioteca *wlthint3client.jar* do mesmo diretório. A obtenção da referência parece bastante padrão e é feita através do InitialContext. Como fábrica de contexto, especificamos uma fábrica específica do WebLogic. Esta classe vem das bibliotecas anexadas.

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

Nosso teste de integração, ou melhor, um teste de sistema, deve terminar com sucesso. Você pode encontrar o nome JNDI apropriado no console do WebLogic, localizando a configuração da conexão na árvore *Services -> Data Sources*:

<img src="/img/hq/wlfullclient-test.png" alt="JNDI do DataSource" title="JNDI do DataSource">

Sem a biblioteca *wlfullclient.jar*, não devemos nos surpreender com o seguinte erro ao tentar obter uma referência ao DataSource:
> Cannot cast 'weblogic.jdbc.common.internal.RmiDataSource_12213_WLStub' to 'javax.sql.DataSource'

Além disso, sem qualquer biblioteca cliente, não inicializaremos o contexto devido à falta de *weblogic.jndi.WLInitialContextFactory*:
> javax.naming.NoInitialContextException: Cannot instantiate class: weblogic.jndi.WLInitialContextFactory
> [Root exception is java.lang.ClassNotFoundException: weblogic.jndi.WLInitialContextFactory]

## DataSource do cliente WebLogic 14.x

A biblioteca *wlfullclient.jar* já foi **depreciada** na versão 12.2.1.3. Agora, na versão 14.1.1.0, não encontraremos o *wljarbuilder.jar*, então não poderemos mais construir o *wlfullclient.jar*. Podemos usar o pacote *wlfullclient.jar* construído a partir de uma das versões anteriores e torcer por compatibilidade não documentada com a versão 14.1.1.0.

Por exemplo, usando pacotes das versões 12.2.1.3 ou 12.2.1.4, nosso teste passará sem problemas, mas com a 12.1.3 obteremos um erro durante a inicialização do contexto:
> java.lang.NoClassDefFoundError: org/omg/PortableServer/POAPackage/ServantNotActive

Uma solução mais compatível é encontrar bibliotecas contendo as classes necessárias no diretório *WL_HOME/modules*. É a partir deste diretório, entre outros, que o *wljarbuilder.jar* constrói o *wlfullclient.jar* em versões anteriores. Podemos usar o seguinte comando para encontrar as classes que precisamos:

```bash
for f in *.jar; do echo "$f: "; unzip -l $f | grep RmiDataSource; done
```
- a classe DataSource será encontrada em *WL_HOME/modules/com.bea.core.datasource6.jar*.

Seguindo as migalhas de pão dos novos rastreamentos de pilha, encontraremos as classes que faltam:
> java.lang.ClassNotFoundException: Failed to load class weblogic.jdbc.rmi.SerialConnection
- *WL_HOME/modules/com.oracle.weblogic.jdbc.jar*

> java.lang.NoClassDefFoundError: weblogic/common/resourcepool/PooledResource
- *WL_HOME/modules/com.bea.core.resourcepool.jar*

Esses 3 pacotes e o *wlthint3client.jar* permitirão que você obtenha uma referência ao DataSource gerenciado por um WebLogic 14.1.1.0 a partir do cliente (Java SE) e consulte o banco de dados com sucesso. Se o seu contêiner exigir uma conexão autenticada, não se esqueça de configurar as credenciais através das propriedades `Context.SECURITY_PRINCIPAL` e `Context.SECURITY_CREDENTIALS` do InitialContext.
