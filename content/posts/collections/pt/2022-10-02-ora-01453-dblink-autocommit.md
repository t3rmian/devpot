---
title: Liberando recursos de conexão dblink
url: dblink-ora-01453-autocommit
id: 96
category:
- databases: Bancos de Dados
tags:
- oracle
- jdbc
- dblink
author: Damian Terlecki
date: 2022-10-02T20:00:00
---

O DBlink do OracleDB é um recurso que permite estabelecer uma conexão com outra instância de banco de dados.

```sql
create public database link remote
    connect to MY_USER identified by MY_PASSWORD
    using '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(service_name=ORCLPDB1)))';

select * from dual@remote;
```

Uma característica interessante de tal conexão é o bloqueio implícito de transação em segmentos de undo, começando com uma simples consulta SELECT em uma tabela dblink.
Este recurso é descrito no [guia do administrador](https://docs.oracle.com/cd/E18283_01/server.112/e17120/ds_appdev002.htm) para a versão 11.2.
Do ponto de vista da aplicação, isso é particularmente interessante em termos de liberação de recursos. Ainda mais quando o acesso ao dblink pode estar oculto sob uma view ou procedure.

<img src="/img/hq/ora-01453-dblink-autocommit.png" alt="Visão do DBLink" title="Visão do DBLink">

## Pool de conexões

Uma aplicação típica geralmente usa algum tipo de pool de conexões.
Dependendo da tecnologia e do nível de abstração, o uso do pool pode:
- estar oculto para o usuário e ser totalmente gerenciado pelo servidor/contêiner (JPA/JTA);
- acontecer a pedido do usuário (acesso direto ao DataSource), cuja responsabilidade é liberar os recursos alocados na sessão.

Quando tal conexão não é mais necessária pela aplicação (fim declarativo de uma transação/comando de fechamento de conexão), ela retorna ao pool.
Posteriormente, pode ser reutilizada sem ser fisicamente fechada.

## JDBC e dblink

A natureza transacional da funcionalidade dblink deve deixá-lo em alerta. Você precisará de um commit ou
rollback para liberar o bloqueio da transação. Isso pode parecer particularmente estranho nas seguintes situações:
- usar dblink em uma conexão em modo auto-commit não permite que você invoque um commit/rollback sem alterar o modo (especialmente problemático com um JTA não transacional);
> java.sql.SQLException: Could not rollback with auto-commit set on
> at oracle.jdbc.driver.PhysicalConnection.rollback(PhysicalConnection.java:2427)
- usar dblink em uma conexão em modo somente leitura, ou seja, `SET TRANSACTION READ ONLY;` - o bloqueio da transação ocorrerá de qualquer maneira.

Por exemplo, ao liberar uma conexão sem liberar os recursos alocados pelo *dblink*, alterar o nível da transação em uma conexão "fresca" pode falhar:
> java.sql.SQLException: ORA-01453: SET TRANSACTION must be first statement of transaction  
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:450)  
at oracle.jdbc.driver.T4CTTIoer.processError(T4CTTIoer.java:399)  
at oracle.jdbc.driver.T4C8Oall.processError(T4C8Oall.java:1059)  
at oracle.jdbc.driver.T4CTTIfun.receive(T4CTTIfun.java:522)  
at oracle.jdbc.driver.T4CTTIfun.doRPC(T4CTTIfun.java:257)  
at oracle.jdbc.driver.T4C8Oall.doOALL(T4C8Oall.java:587)

	at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:225)  
	at oracle.jdbc.driver.T4CPreparedStatement.doOall8(T4CPreparedStatement.java:53)  
	at oracle.jdbc.driver.T4CPreparedStatement.executeForRows(T4CPreparedStatement.java:943)  
	at oracle.jdbc.driver.OracleStatement.doExecuteWithTimeout(OracleStatement.java:1150)  
	at oracle.jdbc.driver.OraclePreparedStatement.executeInternal(OraclePreparedStatement.java:4798)  
	at oracle.jdbc.driver.OraclePreparedStatement.execute(OraclePreparedStatement.java:4901)  
	at oracle.jdbc.driver.OraclePreparedStatementWrapper.execute(OraclePreparedStatementWrapper.java:1385)

Na realidade, ficará da seguinte forma:
```sql
-- app conn 1 (physical conn 1)
SET TRANSACTION READ ONLY;
select * from dual@remote;
-- app conn 1 closed (physical conn 1)
-- app conn 2 (physical conn 1)
SET TRANSACTION READ ONLY; -- error
```

## Verificação/depuração

Para verificar se o problema é relevante para sua aplicação, você pode verificar as transações abertas no banco de dados.
Você precisará de permissões de SELECT nas seguintes visões de sistema:
```sql
GRANT SELECT ON V_$TRANSACTION to MY_USER; -- transações ativas
GRANT SELECT ON V_$SESSION to MY_USER; -- sessões
GRANT SELECT ON V_$SQL to MY_USER; -- consultas recentes nas sessões
GRANT SELECT ON V_$PROCESS to MY_USER; -- associação sessão-processo
GRANT SELECT ON V_$DBLINK to MY_USER; -- conexões dblink e status de transação, mas apenas para a sessão atual
```

Depois de obter as permissões, é hora da consulta:

```sql
SELECT session_.SID
     , session_.SERIAL#
     , session_.USERNAME
     , session_.OSUSER
     , session_.PROGRAM
     , session_.EVENT
     , TO_CHAR(session_.LOGON_TIME,
               'YYYY-MM-DD HH24:MI:SS') as LOGON_TIME
     , TO_CHAR(transaction_.START_DATE,
               'YYYY-MM-DD HH24:MI:SS') as START_DATE
     , session_.LAST_CALL_ET
     , session_.BLOCKING_SESSION
     , session_.STATUS
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.PREV_SQL_ID
          AND ROWNUM <= 1)              AS PREV_SQL
     , (SELECT query_.SQL_TEXT
        FROM V$SQL query_
        WHERE query_.SQL_ID = session_.SQL_ID
          AND ROWNUM <= 1)              AS CURRENT_SQL
FROM V$SESSION session_,
     V$TRANSACTION transaction_
WHERE session_.SADDR = transaction_.SES_ADDR;
```

Na consulta acima, dê uma olhada nas seguintes colunas:
- `LAST_CALL_ET` mostrando o número de segundos desde a última atividade na sessão;
- `START_DATE` da transação correspondente a algum evento na aplicação;
- a consulta anterior `PREV_SQL` ou atual `CURRENT_SQL` na sessão;

Normalmente, essa informação é suficiente para identificar a origem do problema.

## Logs

Rastrear as chamadas no nível do JDBC pode ajudá-lo a associar com precisão uma transação aberta a um processo específico.
Dê uma olhada na [configuração de log do OJDBC](https://docs.oracle.com/database/121/JJDBC/diagnose.htm#JJDBC28885).
Em resumo, você precisará de um driver construído para log, ou seja, com o sufixo `_g`, por exemplo, de um repositório Maven:

```xml
<dependency>
    <groupId>com.oracle.database.jdbc.debug</groupId>
    <artifactId>ojdbc8_g</artifactId>
    <version>21.7.0.0</version>
</dependency>
```

Após a configuração básica, você notará logs correspondentes ao estabelecimento da conexão (eventos de logon) e às consultas invocadas:
```plaintext
2022-10-02 10:59:12.150  INFO 524 --- [main] oracle.jdbc: setCollectionUsageThreshold<PS Old Gen>(5136659251)
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Connection.logon: oracle.jdbc.driver.T4CConnection@66f659e6
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Operating System Process Identifier (SPID): 2411
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: DRCP Enabled: false
2022-10-02 10:59:13.029  INFO 524 --- [main] com.zaxxer.hikari.HikariDataSource: HikariPool-1 - Start completed.
2022-10-02 10:59:13.795  INFO 524 --- [main] oracle.jdbc: 30839E44 SQL: SET TRANSACTION READ ONLY
2022-10-02 10:59:13.900  INFO 524 --- [main] oracle.jdbc: 47E51549 SQL: SELECT * FROM orders@remote
```

Além disso, com o log mais detalhado, você também encontrará o SID/SERIAL#/TRACEFILE associado às consultas:

```plaintext
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSerialNumber
FINEST: 191A709B Return: 42858
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSessionId
FINEST: 191A709B Return: 285
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.OracleSql getOriginalSql
FINEST: 360E9C06 Return: SELECT * FROM orders@remote
```

Você obterá a associação sessão-processo consultando a base:
```sql
SELECT *
FROM V$SESSION s
         JOIN V$PROCESS p on s.PADDR = p.ADDR
WHERE p.SPID = 2411;
```

Infelizmente, esse log de baixo nível pode gerar dezenas de MBs de logs por segundo, então é melhor configurá-lo
apenas para os pacotes relevantes. Você pode então identificar uma função específica por logs de thread compartilhados ou algum ID de correlação.
Alternativamente, você pode adicionar informações de rastreamento à sessão do banco de dados através do pacote `DBMS_APPLICATION_INFO`.

> `connection.setClientInfo("OCSID.MODULE", "Minha aplicação");`  
> `connection.setClientInfo("OCSID.ACTION", "Gerar um relatório");`

