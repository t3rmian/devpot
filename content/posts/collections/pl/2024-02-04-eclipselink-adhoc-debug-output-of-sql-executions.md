---
title: Doraźny sposób wypisania zapytań wyjściowych EclipseLink w trybie debug
url: debugowanie-zapytań-wyjściowych-sql-eclipselink
id: 124
category:
  - jpa: JPA
tags:
  - eclipselink
  - logowanie
  - wydajność
  - debugowanie
author: Damian Terlecki
date: 2024-02-04T20:00:00
---

Jeśli zdarzy ci się debugować aplikację działającą w środowisku EclipseLink bez odpowiedniej konfiguracji logowania,
odnalezienie zapytania SQL wygenerowanego przez EL może okazać się trudne. Zwykle w konfiguracji *persistence* EL
mamy do wyboru opcje `eclipselink.logging.level` i `eclipselink.logging.logger`. Kontrolują one zachowanie
logowania wewnątrz EclipseLink. Na poziomie logowania `FINE` wypisywane są zapytania SQL, co pozwala na analizę
złożonych procesów biznesowych pod względem wydajności dostępu do danych.

Gdy logowanie jest wyłączone lub niedostępne, ale dostępny jest port do debugowania JVM, możesz poszukać miejsc, w których
logi są zapisywane do strumienia wyjściowego. W przypadku EclipseLink większość logowania realizowana jest poprzez
interfejs` org.eclipse.persistence.logging.SessionLog`:

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

Na tych metodach umieścić możesz punkty przerwania i podejrzeć wiadomości, ale wszystkie metody zapisujące logi są chronione przez
sprawdzenie warunku `shouldLog` w celu zabezpieczenia przed tworzeniem niepotrzebnych obiektów.
W tym przypadku kontekst nie zawiera treści wiadomości, co nieco utrudnia debugowanie.
Innym powszechnym miejscem, poza logowaniem, które zawiera treści zapytań do bazy danych w swoim kontekście, jest proces profilowania.

Większość profilowania w EclipseLink rozpoczyna się od operacji `startOperationProfile` w
klasie `org.eclipse.persistence.internal.sessions.AbstractSession`. Chociaż jest to metoda wewnętrzna, która podlega nieoczekiwanym
zmianom (wersja 2.7), to nic nie stoi na przeszkodzie, abyśmy ją przedebugowali.


<img src="/img/hq/debug-profiling-eclipselink.png" title="Profiler EclipseLink AbstractSession" alt="Profiler EclipseLink AbstractSession">

Za pomocą IDE możesz wypisać szczegóły zapytania z parametru do konsoli lokalnej. Do *breakpointu* warto dodać warunek
sprawdzający typ operacji, jakim jest wykonanie zapytania: `SessionProfiler.StatementExecute.equals(nazwaoperacji) && query != null`.
Jeśli chodzi o dane wyjściowe, treść zapytania SQL możemy wypisać na konsolę IDE wraz z opcjonalnym wierszem tłumaczenia reprezentującym parametry
wiązania `return String.format("%s%nBind parameters: %s%n%s",query.getSQLString(), java.util.Objects.toString(query.getQueryMechanism().getModifyRow(), ""), java.util.Objects.toString(query.getQueryMechanism().getTranslationRow(), ""));`:

<img src="/img/hq/debug-output-sql-executions-eclipselink.png" title="Debugowanie (IntelliJ) profilowania EclipseLink w AbstractSession" alt="Debugowanie (IntelliJ) profilowania EclipseLink w AbstractSession">

Bez zatrzymywania się na *breakpoincie* (wyłączona flaga *suspend*) debugger wypisze przykładowe dane wyjściowe zapytania:

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

<img src="/img/hq/debug-profiling-console-eclipselink.png" title="Dane wyjściowe debugowania konsoli IDE (IntelliJ) profilowania w EclipseLink AbstractSession" alt="Dane wyjściowe debugowania konsoli IDE (IntelliJ) profilowania w EclipseLink AbstractSession">

Zawsze możesz też wygenerować bardziej istotne informacje, aby powiązać zapytania z procesami aplikacyjnymi.
Pomyśl o dodaniu czasu, identyfikatora wątku, identyfikatora połączenia *accessora* zapytania lub własnych niestandardowych informacji kontekstowych.