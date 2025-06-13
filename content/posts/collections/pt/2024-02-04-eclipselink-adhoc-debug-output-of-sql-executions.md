---
title: Uma forma ad-hoc de depurar a saída de queries no EclipseLink
url: depurar-saida-queries-sql-eclipselink
id: 124
category:
- jpa: JPA
tags:
- eclipselink
- logging
- desempenho
- depuracao
author: Damian Terlecki
date: 2024-02-04T20:00:00
---

Se você precisar depurar uma aplicação que usa o EclipseLink sem uma configuração de logging adequada, pode ser
desafiador obter a query SQL final gerada pelo EL. Normalmente, existem as propriedades
`eclipselink.logging.level` e `eclipselink.logging.logger` na configuração de persistência do EL.
Elas controlam o comportamento do logging. Com o nível `FINE`, você pode registrar as queries SQL de processos complexos e verificar se elas são subótimas.

Quando o logging está desativado ou inacessível, mas a porta de depuração da JVM está disponível, você pode procurar por lugares
onde os logs são escritos no fluxo de saída. No caso do EclipseLink, a maior parte do logging é
implementada através da interface `org.eclipse.persistence.logging.SessionLog`:

```java
public interface SessionLog extends Cloneable {
    //... log-related methods
    public boolean shouldLog(int level);
    public boolean shouldLog(int level, String category);
    public void log(int level, String message);
    //12 overloads...
    public void throwing(Throwable throwable);
    public void severe(String message);
    public void warning(String message);
    //5 more JDK-related log-level methods...
    public void logThrowable(int level, Throwable throwable);
    public void logThrowable(int level, String category, Throwable throwable);
    //...
}
```
Você pode colocar breakpoints nesses métodos, mas todos os métodos que geram logs são protegidos pelos métodos `shouldLog` (sem mensagem)
de criar objetos desnecessários. Outro lugar comum, além do logging, que tem a query do banco de dados em seu contexto é o profiling.

A maior parte do profiling no EclipseLink começa a partir da operação `startOperationProfile` em
`org.eclipse.persistence.internal.sessions.AbstractSession`. Embora seja um método interno sujeito a alterações (versão 2.7),
você está livre para depurá-lo conforme suas necessidades.

<img src="/img/hq/debug-profiling-eclipselink.png" title="Profiler AbstractSession do EclipseLink" alt="Profiler AbstractSession do EclipseLink">

Com a ajuda de uma IDE, você pode exibir os detalhes da query no console local.
Para a condição do breakpoint, verifique se é uma query de execução de instrução `SessionProfiler.StatementExecute.equals(operationName) && query != null`.
Quanto à saída, concatene a string SQL com uma linha de tradução opcional representando os parâmetros de bind `return String.format("%s%nBind parameters: %s%n%s",query.getSQLString(), java.util.Objects.toString(query.getQueryMechanism().getModifyRow(), ""), java.util.Objects.toString(query.getQueryMechanism().getTranslationRow(), ""));`:

<img src="/img/hq/debug-output-sql-executions-eclipselink.png" title="Depuração do profiler AbstractSession do EclipseLink" alt="Depuração do profiler AbstractSession do EclipseLink">

Sem suspender a execução, uma saída de exemplo é gerada:

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

<img src="/img/hq/debug-profiling-console-eclipselink.png" title="Saída de depuração no console da IDE do profiler AbstractSession do EclipseLink" alt="Saída de depuração no console da IDE do profiler AbstractSession do EclipseLink">

Você pode sempre exibir mais informações relevantes para correlacionar as queries com os processos da sua aplicação.
Pense em adicionar a hora, o ID da thread, a conexão do acessor da query ou informações de contexto personalizadas.
