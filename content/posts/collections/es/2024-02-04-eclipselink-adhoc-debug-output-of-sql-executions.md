---
title: Forma ad-hoc de depurar queries en EclipseLink
url: debug-output-sql-executions-eclipselink
id: 124
category:
  - jpa: JPA
tags:
  - eclipselink
  - logging
  - performance
  - debugging
author: Damian Terlecki
date: 2024-02-04T20:00:00
---

Si alguna vez tienes que depurar una app con EclipseLink sin una configuración de logging adecuada, puede ser complicado ver la consulta SQL final generada por EL. Normalmente, las propiedades `eclipselink.logging.level` y `eclipselink.logging.logger` en la configuración de persistencia controlan el logging. Con el nivel `FINE` puedes ver las queries SQL y comprobar si son óptimas.

Cuando el logging está desactivado o no es accesible, pero tienes el puerto de debug de la JVM, puedes buscar los lugares donde se escriben los logs en el output. En EclipseLink, la mayoría del logging se implementa con la interfaz `org.eclipse.persistence.logging.SessionLog`:

```java
public interface SessionLog extends Cloneable {
    //... métodos de log
    public boolean shouldLog(int level);
    public boolean shouldLog(int level, String category);
    public void log(int level, String message);
    //12 overloads...
    public void throwing(Throwable throwable);
    public void severe(String message);
    public void warning(String message);
    //5 métodos más relacionados con log de JDK...
    public void logThrowable(int level, Throwable throwable);
    public void logThrowable(int level, String category, Throwable throwable);
    //...
}
```
Puedes poner breakpoints ahí, pero todos los métodos de log están protegidos por los métodos `shouldLog` (sin mensaje) para evitar crear objetos innecesarios. Otro lugar común además del logging donde está la query es el profiling.

La mayoría del profiling en EclipseLink empieza en el método `startOperationProfile` de `org.eclipse.persistence.internal.sessions.AbstractSession`. Aunque es un método interno y puede cambiar (versión 2.7), puedes depurarlo según lo necesites.

<img src="/img/hq/debug-profiling-eclipselink.png" title="EclipseLink AbstractSession profiler" alt="EclipseLink AbstractSession profiler">

Con ayuda del IDE, puedes sacar los detalles de la query en la consola local. Para la condición del breakpoint, comprueba si es una query de ejecución de statement: `SessionProfiler.StatementExecute.equals(operationName) && query != null`. Para el output, concatena el SQL con los parámetros de bind: `return String.format("%s%nBind parameters: %s%n%s",query.getSQLString(), java.util.Objects.toString(query.getQueryMechanism().getModifyRow(), ""), java.util.Objects.toString(query.getQueryMechanism().getTranslationRow(), ""));`:

<img src="/img/hq/debug-output-sql-executions-eclipselink.png" title="EclipseLink AbstractSession profiler debug" alt="EclipseLink AbstractSession profiler debug">

Sin suspender la ejecución, el output de ejemplo sería:

```sql
CREATE TABLE EMPLOYEE (ID BIGINT NOT NULL, DEPARTMENT VARCHAR, NAME VARCHAR, ADDRESS_ID BIGINT, PRIMARY KEY (ID))
Bind parameters: EmptyRecord()
SELECT * FROM SEQUENCE WHERE SEQ_NAME = 'SEQ_GEN'
Bind parameters: EmptyRecord()
INSERT INTO SEQUENCE(SEQ_NAME, SEQ_COUNT) values ('SEQ_GEN', 0)
Bind parameters: EmptyRecord()
UPDATE SEQUENCE SET SEQ_COUNT = SEQ_COUNT + ? WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN
	PREALLOC_SIZE => 50)
SELECT SEQ_COUNT FROM SEQUENCE WHERE SEQ_NAME = ?
Bind parameters: DatabaseRecord(
	SEQ_NAME => SEQ_GEN)
INSERT INTO EMPLOYEE (ID, DEPARTMENT, NAME, ADDRESS_ID) VALUES (?, ?, ?, ?)
Bind parameters: DatabaseRecord(
	EMPLOYEE.ID => 1
	EMPLOYEE.DEPARTMENT => Marketing
	EMPLOYEE.NAME => Jane Smith
	EMPLOYEE.ADDRESS_ID => null)
	SALARY.employee_id => null)
```

<img src="/img/hq/debug-profiling-console-eclipselink.png" title="EclipseLink AbstractSession profiler IDE console debug output" alt="EclipseLink AbstractSession profiler IDE console debug output">

Siempre puedes sacar más información relevante para correlacionar queries con procesos de tu app. Piensa en añadir hora, thread ID, conexión del query accessor o contexto personalizado.
