---
title: Liberando recursos de conexión dblink
url: dblink-ora-01453-autocommit
id: 96
category:
  - databases: Bases de datos
tags:
  - oracle
  - jdbc
  - dblink
author: Damian Terlecki
date: 2022-10-02T20:00:00
---

OracleDB DBlink es una funcionalidad que permite establecer una conexión con otra instancia de base de datos.

```sql
create public database link remote
    connect to MY_USER identified by MY_PASSWORD
    using '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(service_name=ORCLPDB1)))';

select * from dual@remote;
```

Una característica interesante de esta conexión es el bloqueo transaccional implícito sobre los segmentos undo que comienza con una simple consulta SELECT sobre una tabla dblink.
Esta funcionalidad se describe en la [guía de administración](https://docs.oracle.com/cd/E18283_01/server.112/e17120/ds_appdev002.htm) para la versión 11.2.
Desde el punto de vista de la aplicación, esto es relevante para la liberación de recursos, especialmente cuando el acceso dblink puede estar oculto bajo una vista o procedimiento.

<img src="/img/hq/ora-01453-dblink-autocommit.png" alt="Vista DBLink" title="Vista DBLink">

## Pool de conexiones

Una aplicación típica suele usar algún tipo de pool de conexiones.
Según la tecnología y el nivel de abstracción, el uso del pool puede:
- estar oculto y gestionado por el servidor/contenedor (JPA/JTA);
- ocurrir a petición del usuario (acceso directo a DataSource), siendo su responsabilidad liberar los recursos de la sesión.

Cuando la aplicación ya no necesita la conexión (fin declarativo de la transacción/cierre de conexión), esta vuelve al pool.
Luego puede reutilizarse sin cerrarse físicamente.

## JDBC y dblink

La naturaleza transaccional de dblink debe ponerte en alerta. Necesitarás un commit o rollback para liberar el bloqueo de la transacción. Puede resultar extraño en situaciones como:
- usar dblink en una conexión en modo auto-commit no permite invocar commit/rollback sin cambiar el modo (especialmente problemático con JTA no transaccional);
> java.sql.SQLException: Could not rollback with auto-commit set on
> at oracle.jdbc.driver.PhysicalConnection.rollback(PhysicalConnection.java:2427)
- usar dblink en una conexión en modo solo lectura, es decir, `SET TRANSACTION READ ONLY;` – el bloqueo ocurre igual.

Por ejemplo, al liberar una conexión sin liberar los recursos de *dblink*, cambiar el nivel de transacción en una "nueva" conexión puede fallar:
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
	at oracle.jdbc.driver.OraclePreparedStatement.executeInternal(OraclePreparedStatement.java:4798)  
	at oracle.jdbc.driver.OraclePreparedStatement.execute(OraclePreparedStatement.java:4901)  
	at oracle.jdbc.driver.OraclePreparedStatementWrapper.execute(OraclePreparedStatementWrapper.java:1385)

En la práctica, se verá así:
```sql
-- app conn 1 (physical conn 1)
SET TRANSACTION READ ONLY;
select * from dual@remote;
-- app conn 1 closed (physical conn 1)
-- app conn 2 (physical conn 1)
SET TRANSACTION READ ONLY; -- error
```

## Verificación/depuración

Para comprobar si el problema afecta a tu aplicación, puedes verificar las transacciones abiertas en la base de datos.
Necesitarás permisos SELECT sobre las siguientes vistas de sistema:
```sql
GRANT SELECT ON V_$TRANSACTION to MY_USER; -- transacciones activas
GRANT SELECT ON V_$SESSION to MY_USER; -- sesiones
GRANT SELECT ON V_$SQL to MY_USER; -- últimas consultas en las sesiones
GRANT SELECT ON V_$PROCESS to MY_USER; -- asociación sesión-proceso
GRANT SELECT ON V_$DBLINK to MY_USER; -- conexiones dblink y estado de transacción, solo para la sesión actual
```

Con los permisos, ejecuta la consulta:

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

En la consulta, revisa las siguientes columnas:
- `LAST_CALL_ET` muestra los segundos desde la última actividad en la sesión;
- `START_DATE` de la transacción asociada a algún evento en la aplicación;
- la consulta previa `PREV_SQL` o la actual `CURRENT_SQL` en la sesión;

Normalmente, esta información basta para identificar el origen del problema.

## Logs

Rastrear las llamadas a nivel JDBC puede ayudarte a asociar una transacción abierta a un proceso concreto.
Revisa la [configuración de logging de OJDBC](https://docs.oracle.com/database/121/JJDBC/diagnose.htm#JJDBC28885).
Necesitarás un driver compilado para logging, con sufijo `_g`, por ejemplo desde un repositorio Maven:

```xml
<dependency>
    <groupId>com.oracle.database.jdbc.debug</groupId>
    <artifactId>ojdbc8_g</artifactId>
    <version>21.7.0.0</version>
</dependency>
```

Tras la configuración básica, verás logs que corresponden al establecimiento de conexión (eventos logon) y consultas ejecutadas:
```plaintext
2022-10-02 10:59:12.150  INFO 524 --- [main] oracle.jdbc: setCollectionUsageThreshold<PS Old Gen>(5136659251)
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Connection.logon: oracle.jdbc.driver.T4CConnection@66f659e6
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Operating System Process Identifier (SPID): 2411
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: DRCP Enabled: false
2022-10-02 10:59:13.029  INFO 524 --- [main] com.zaxxer.hikari.HikariDataSource: HikariPool-1 - Start completed.
2022-10-02 10:59:13.795  INFO 524 --- [main] oracle.jdbc: 30839E44 SQL: SET TRANSACTION READ ONLY
2022-10-02 10:59:13.900  INFO 524 --- [main] oracle.jdbc: 47E51549 SQL: SELECT * FROM orders@remote
```

Además, con el logging más detallado, también verás el SID/SERIAL#/TRACEFILE asociado a las consultas:

```plaintext
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSerialNumber
FINEST: 191A709B Return: 42858
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSessionId
FINEST: 191A709B Return: 285
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.OracleSql getOriginalSql
FINEST: 360E9C06 Return: SELECT * FROM orders@remote
```

Puedes obtener la asociación sesión-proceso consultando la base:
```sql
SELECT *
FROM V$SESSION s
         JOIN V$PROCESS p on s.PADDR = p.ADDR
WHERE p.SPID = 2411;
```

Desafortunadamente, este logging tan bajo puede generar decenas de MBs de logs por segundo, así que configúralo
solo para los paquetes relevantes. Así puedes identificar una función por logs de hilo compartido o algún ID de correlación.
Alternativamente, puedes añadir información de tracking a la sesión de base de datos con el paquete `DBMS_APPLICATION_INFO`.

> `connection.setClientInfo("OCSID.MODULE", "My application");`  
> `connection.setClientInfo("OCSID.ACTION", "Generate a report");`
