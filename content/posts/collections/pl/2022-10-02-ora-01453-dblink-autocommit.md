---
title: Zwalnianie zasobów przy połączeniu dblink
url: dblink-ora-01453-autocommit
id: 96
category:
  - databases: Bazy danych
tags:
  - oracle
  - jdbc
  - dblink
author: Damian Terlecki
date: 2022-10-02T20:00:00
---

DBlink w OracleDB to funkcjonalność umożliwiająca ustanowienie połączanie z inną bazą danych.

```sql
create public database link remote
    connect to MY_USER identified by MY_PASSWORD
    using '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(service_name=ORCLPDB1)))';

select * from dual@remote;
```

Ciekawą charakterystyką takiego połączenia jest automatyczne tworzenie swego rodzaju transakcji (*transaction lock on undo segments*) przy zwykłym selekcie z takiego połączenia.
Cecha ta opisana została w [podręczniku](https://docs.oracle.com/cd/E18283_01/server.112/e17120/ds_appdev002.htm) administratora bazy do wersji 11.2.
Z poziomu aplikacji jest to szczególnie interesujące pod względem zwalniania zasobów. Tym bardziej, kiedy możemy ukryć wykorzystanie dblinka pod widokiem bądź procedurą.

<img src="/img/hq/ora-01453-dblink-autocommit.png" alt="Widok przy użyciu dblink" title="Widok przy użyciu dblink">

## Pula połączeń

Typowa aplikacja często korzysta z pewnego rodzaju puli połączeń.
W zależności od technologii i poziomu abstrakcji korzystanie z puli może:
- być ukryte przed użytkownikiem i obsługiwane w całości przez serwer/kontener (JPA/JTA);
- odbywać się na wyraźne polecenie użytkownika, do którego należy obowiązek zwolnienia zasobów zaalokowanych w sesji połączenia (bezpośredni dostęp do DataSource'a).

Gdy takie połączenie nie jest już potrzebne aplikacji (deklaratywny koniec transakcji/polecenie zamknięcia), wraca ono do puli do ponownego użycia bez konieczności jego fizycznego zamknięcia.

## JDBC a dblink

Znając charakter transakcyjny funkcjonalności *dblink*, warto więc mieć się na baczności.
Do zwolnienia transakcji potrzebować będziemy *commita* bądź *rollbacka*.
Szczególnie dziwne wydać to się może w następujących sytuacjach:
- użycie *dblinka* na połączeniu w trybie *autocommit* – nie pozwala na wywołanie *commita/rollbacka* bez zmiany trybu (szczególnie problematyczne w przypadku nietransakcyjnego JTA);
> java.sql.SQLException: Could not rollback with auto-commit set on
at oracle.jdbc.driver.PhysicalConnection.rollback(PhysicalConnection.java:2427)
- użycie *dblinka* na połączeniu w trybie *read-only* tj. `SET TRANSACTION READ ONLY;` – transakcja i tak zostanie założona.

Przykładowo, przy zwolnieniu połączenia bez zwolnienia zasobów zaalokowanych przez *dblink*, przy "świeżym" próba zmiany poziomu transakcyjności
może się nie udać:
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

Fizycznie wyglądać będzie to następująco:
```sql
-- app conn 1 (physical conn 1)
SET TRANSACTION READ ONLY;
select * from dual@remote;
-- app conn 1 closed (physical conn 1)
-- app conn 2 (physical conn 1)
SET TRANSACTION READ ONLY; -- error
```

## Weryfikacja/debugowanie

Sprawdzenie, czy problem dotyczy naszej aplikacji, można zacząć od weryfikacji otwartych transakcji na bazie.
Potrzebować będziesz wglądu do następujących widoków systemowych:
```sql
GRANT SELECT ON V_$TRANSACTION to MY_USER; -- aktywne transakcje
GRANT SELECT ON V_$SESSION to MY_USER; -- sesje
GRANT SELECT ON V_$SQL to MY_USER; -- ostatnie zapytanie w sesji
GRANT SELECT ON V_$PROCESS to MY_USER; -- powiązanie procesu z sesją
GRANT SELECT ON V_$DBLINK to MY_USER; -- wyświetla połączenia i status transakcji, ale jedynie te będące wynikiem działania obecnej sesji
```

Po uzyskaniu uprawnień od administratora, pora na zapytanie:

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
W powyższym zapytaniu warto zwrócić uwagę na:
- na liczbę sekund `LAST_CALL_ET` od ostatniej aktywności w sesji;
- początek transakcji `START_DATE` odpowiadający jakiemuś zdarzeniu w aplikacji;
- ostanie `PREV_SQL` bądź obecne `CURRENT_SQL` zapytanie w sesji;

Zazwyczaj dane te wystarczają na zidentyfikowanie źródła problemu.

## Logi

Prześledzenie wywołań na poziomie JDBC może pozwolić Ci na dokładniejsze powiązanie otwartej transakcji z konkretnym procesem.
Rzuć okiem na [konfigurację logowania OJDBC](https://docs.oracle.com/database/121/JJDBC/diagnose.htm#JJDBC28885).
W skrócie potrzebować będziesz sterownika zbudowanego pod logowanie tj. z suffiksem `_g`, np. z repozytorium mavenowego:
```xml
<dependency>
    <groupId>com.oracle.database.jdbc.debug</groupId>
    <artifactId>ojdbc8_g</artifactId>
    <version>21.7.0.0</version>
</dependency>
```

Po podstawowej konfiguracji zauważysz logi z ustanowienia połączenia i wywołane zapytania:
```plaintext
2022-10-02 10:59:12.150  INFO 524 --- [main] oracle.jdbc: setCollectionUsageThreshold<PS Old Gen>(5136659251)
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Connection.logon: oracle.jdbc.driver.T4CConnection@66f659e6
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: Operating System Process Identifier (SPID): 2411
2022-10-02 10:59:13.018  INFO 524 --- [main] oracle.jdbc: DRCP Enabled: false
2022-10-02 10:59:13.029  INFO 524 --- [main] com.zaxxer.hikari.HikariDataSource: HikariPool-1 - Start completed.
2022-10-02 10:59:13.795  INFO 524 --- [main] oracle.jdbc: 30839E44 SQL: SET TRANSACTION READ ONLY
2022-10-02 10:59:13.900  INFO 524 --- [main] oracle.jdbc: 47E51549 SQL: SELECT * FROM orders@remote
```

Dodatkowo przy niskopoziomowym logowaniu odnajdziesz również SID/SERIAL#/TRACEFILE związany z danym zapytaniem:

```plaintext
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection logConnectionInfoAfterLogonAlways
INFO: Operating System Process Identifier (SPID): 3860
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSerialNumber
FINEST: 191A709B Return: 42858
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.T4CConnection getSessionId
FINEST: 191A709B Return: 285
Oct 02, 2022 11:32:07 AM oracle.jdbc.driver.OracleSql getOriginalSql
FINEST: 360E9C06 Return: SELECT * FROM orders@remote
```

Powiązanie sesji z procesem uzyskasz, odpytując bazę:
```sql
SELECT *
FROM V$SESSION s
         JOIN V$PROCESS p on s.PADDR = p.ADDR
WHERE p.SPID = 2411;
```

Niestety niskopoziomowe logowanie może wygenerować kilkadziesiąt MB logów w ciągu sekundy, dlatego ważne jest ustawienie poziomu
jedynie dla najważniejszych pakietów. Identyfikację konkretnej funkcji możesz następnie wykonać, wiążąc logi przykładowo poprzez wspólny wątek/unikalny identyfikator
bądź odwrotnie – dodając takie informacje już do samej sesji (pakiet `DBMS_APPLICATION_INFO`). 

> `connection.setClientInfo("OCSID.MODULE", "My application");`  
> `connection.setClientInfo("OCSID.ACTION", "Generate a report");`
