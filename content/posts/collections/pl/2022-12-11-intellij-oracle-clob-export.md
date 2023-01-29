---
title: Eksport CLOBów z bazy Oracle przy użyciu IntelliJ
url: oracle-clob-intellij-data-extractor
id: 101
category:
  - other: Inne
tags:
  - oracle
  - intellij
  - sqlplus
author: Damian Terlecki
date: 2022-12-11T20:00:00
---

Zarządzanie danymi tekstowymi pod postacią CLOB w Oracle nie jest zbyt wygodne.
Można wymienić kilka różnych narzędzi pozwalających na import i eksport takich danych: SQL\*Loader, Data Pump, pakiet DBMS_LOB.

Gdy jednak potrzebujemy czysto SQLowego podejścia, możemy skorzystać z niejawnego rzutowania bądź funkcji `TO_CLOB` przyjmującej jako parametr typ VARCHAR2.
Dwa ograniczenia związane z tą koncepcją można wylistować pod postacią błędów:
- `ORA-01704: string literal too long` – czyli użycie tekstu typu VARCHAR2 o długości wyższej niż 4000-32767 bajtów (w zależności od parametru inicjalizacyjnego `MAX_STRING_SIZE`);
- `SP2-0027: Input is too long (> N characters)` – czyli błąd narzędzia `sqlplus` pojawiający się, gdy linia w skrypcie jest dłuższa niż wewnętrzny limit narzędzia (zazwyczaj limit większy niż 2000).

Obejściem obu problemów jest rozbicie wartości na mniejsze kawałki i konkatenacja dodatkowo w oddzielnych liniach.
Rozwiązanie to opisane jest na popularnym [forum Ask Tom](https://asktom.oracle.com/pls/apex/f?p=100:11:0::::P11_QUESTION_ID:9523893800346388494).
Potrzebujemy do tego narzędzia SQL\*Plus, jednak tutaj opiszę, jak możemy obejść się bez niego pod warunkiem, że pracujemy ze środowiskiem IntelliJ.

## IntelliJ Data Extractor

Moduł Database w IntelliJ Ultimate 2022 (Menu – View – Tool Windows – Database) realizuje podstawowe funkcje pełnoprawnego klienta
wspierającego wiele różnych baz danych. Po skonfigurowaniu dostępu do bazy dostajemy możliwość, między innymi, wyświetlania i eksportu danych z tabeli.
"Data Extractors" to proste programy pozwalające na wyeksportowanie danych według określonego formatu.

<img src="/img/hq/intellij-custom-data-extractor.png" alt="IntelliJ wyjście konsoli bazy danych" title="IntelliJ wyjście konsoli bazy danych">

Wybierając standardowy ekstraktor "SQL Insert", IntelliJ wygeneruje nam polecenia `INSERT` z danymi wyodrębnionymi z zapytania.
Niestety tekst z kolumn CLOB zostanie tutaj wyeksportowany jednym ciągiem i napotkamy wcześniej opisane problemy.

<img src="/img/hq/intellij-data-extractors.png" alt="IntelliJ ekstraktor danych bazy" title="IntelliJ ekstraktor danych bazy">

Przeglądając listę ekstraktorów, znajdziemy natomiast katalog z ich implementacjami.
Nic nie stoi więc na przeszkodzie, aby za pomocą kilku linii, dodać do ekstraktora obejście błędów ORA-01704 i SP2-0027.
Wystarczy, że skopiujesz interesujący Cię ekstraktor pod własną nazwą i automatycznie pojawi się on na liście ekstraktorów.

<img src="/img/hq/intellij-data-extractors-directory.png" alt="IntelliJ własny ekstraktor danych" title="IntelliJ własny ekstraktor danych">

Sprawdźmy program `SQL-Insert-Statements.sql.groovy`. Rozpoczyna się on definicją standardowych parametrów, a trzy ważne
etapy z punktu widzenia przepływu danych to:
1. Ekstrakcja danych z wierszy;
2. Ekstrakcja danych z kolumn;
3. Wypisanie tekstu (kolumny) na wyjściu.

```groovy
/*
 * Available context bindings:
 *   COLUMNS     List<DataColumn>
 *   ROWS        Iterable<DataRow>
 *   OUT         { append() }
 *   FORMATTER   { format(row, col); formatValue(Object, col); getTypeName(Object, col); isStringLiteral(Object, col); }
 *   TRANSPOSED  Boolean
 * plus ALL_COLUMNS, TABLE, DIALECT
 *
 * where:
 *   DataRow     { rowNumber(); first(); last(); data(): List<Object>; value(column): Object }
 *   DataColumn  { columnNumber(), name() }
 */

SEP = ", "
QUOTE     = "\'"
STRING_PREFIX = DIALECT.getDbms().isMicrosoft() ? "N" : ""
NEWLINE   = System.getProperty("line.separator")

KEYWORDS_LOWERCASE = com.intellij.database.util.DbSqlUtil.areKeywordsLowerCase(PROJECT)
KW_INSERT_INTO = KEYWORDS_LOWERCASE ? "insert into " : "INSERT INTO "
KW_VALUES = KEYWORDS_LOWERCASE ? ") values (" : ") VALUES ("
KW_NULL = KEYWORDS_LOWERCASE ? "null" : "NULL"

def record(columns, dataRow) {
    OUT.append(KW_INSERT_INTO)
    if (TABLE == null) OUT.append("MY_TABLE")
    else OUT.append(TABLE.getParent().getName()).append(".").append(TABLE.getName())
    OUT.append(" (")

    columns.eachWithIndex { column, idx ->
        OUT.append(column.name()).append(idx != columns.size() - 1 ? SEP : "")
    }

    OUT.append(KW_VALUES)
    columns.eachWithIndex { column, idx -> // #2
        def value = dataRow.value(column)
        def stringValue = value == null ? KW_NULL : FORMATTER.formatValue(value, column)
        def isStringLiteral = value != null && FORMATTER.isStringLiteral(value, column)
        if (isStringLiteral && DIALECT.getDbms().isMysql()) stringValue = stringValue.replace("\\", "\\\\")
        OUT.append(isStringLiteral ? (STRING_PREFIX + QUOTE) : "")
          .append(isStringLiteral ? stringValue.replace(QUOTE, QUOTE + QUOTE) : stringValue) // #3
          .append(isStringLiteral ? QUOTE : "")
          .append(idx != columns.size() - 1 ? SEP : "")
    }
    OUT.append(");").append(NEWLINE)
}

ROWS.each { row -> record(COLUMNS, row) } // #1
```

## CLOB Data Extractor

Do pomocy w napisaniu własnej logiki JetBrains udostępnia [dokumentację](https://www.jetbrains.com/help/idea/data-extractors.html#api_for_custom_data_extractors).
Przede wszystkim przyda się zdefiniowanie własnych parametrów określających separatory oraz liczbę znaków, po której wywołamy konkatenację:
```groovy
MAX_STRING_SIZE = 2000
CONCAT_SEPARATOR = ' || '
CLOB_PREFIX = '\n TO_CLOB('
```

W kolejnych punktach:
1. Sprawdzamy, czy kolumna jest typu CLOB;
2. Co `MAX_STRING_SIZE` znaków, przy pomocy podmiany REGEX dodajemy zamianę części tekstu na CLOB wraz z konkatenacją;
3. Wypisujemy ostateczna wartość kolumny, pamiętając o domknięciu nawiasów.

```groovy
        /*...*/
        if (isStringLiteral && DIALECT.getDbms().isMysql()) stringValue = stringValue.replace("\\", "\\\\")

        def isOracleClob = value != null && FORMATTER.getTypeName(value, column) == "CLOB" && DIALECT.getDbms().isOracle() // #1
        if (isOracleClob) {
            stringValue = stringValue
                    .replace(QUOTE, QUOTE + QUOTE)
                    .replaceAll("(.{" + MAX_STRING_SIZE + "})", "\$1" + QUOTE + ') ' + CONCAT_SEPARATOR + CLOB_PREFIX + QUOTE) // #2
            OUT.append(STRING_PREFIX + CLOB_PREFIX + QUOTE) // #3
                    .append(stringValue)
                    .append(QUOTE + ")\n")
                    .append(idx != columns.size() - 1 ? SEP : "")
            return
        }
        
        OUT.append(isStringLiteral ? (STRING_PREFIX + QUOTE) : "")
        /*...*/
```

Teraz wybierając ekstraktor z listy i kopiując wiersze (bądź korzystając z ekstrakcji całej tabeli), otrzymamy oczekiwany eksport:
```sql
CREATE TABLE foobar
(
    baz    VARCHAR2(255) PRIMARY KEY,
    foo    CLOB,
    bar    BLOB,
    length AS (LENGTH(foo))
);

--MAX_STRING_SIZE = 1
insert into FOOBAR (BAZ, FOO) values ('<2000 Bytes', 
 TO_CLOB('1')  || 
 TO_CLOB('2')  || 
 TO_CLOB('3')  || 
 TO_CLOB('')
);
```

## Podsumowanie

Finalna implementacja ekstraktora CLOBów może wyglądać następująco:

```groovy
/*
 * Available context bindings:
 *   COLUMNS     List<DataColumn>
 *   ROWS        Iterable<DataRow>
 *   OUT         { append() }
 *   FORMATTER   { format(row, col); formatValue(Object, col); getTypeName(Object, col); isStringLiteral(Object, col); }
 *   TRANSPOSED  Boolean
 * plus ALL_COLUMNS, TABLE, DIALECT
 *
 * where:
 *   DataRow     { rowNumber(); first(); last(); data(): List<Object>; value(column): Object }
 *   DataColumn  { columnNumber(), name() }
 */

SEP = ", "
QUOTE     = "\'"
STRING_PREFIX = DIALECT.getDbms().isMicrosoft() ? "N" : ""
NEWLINE   = System.getProperty("line.separator")

KEYWORDS_LOWERCASE = com.intellij.database.util.DbSqlUtil.areKeywordsLowerCase(PROJECT)
KW_INSERT_INTO = KEYWORDS_LOWERCASE ? "insert into " : "INSERT INTO "
KW_VALUES = KEYWORDS_LOWERCASE ? ") values (" : ") VALUES ("
KW_NULL = KEYWORDS_LOWERCASE ? "null" : "NULL"
MAX_STRING_SIZE = 2000
CONCAT_SEPARATOR = ' || '
CLOB_PREFIX = '\n TO_CLOB('

def record(columns, dataRow) {
    OUT.append(KW_INSERT_INTO)
    if (TABLE == null) OUT.append("MY_TABLE")
    else OUT.append(TABLE.getParent().getName()).append(".").append(TABLE.getName())
    OUT.append(" (")

    columns.eachWithIndex { column, idx ->
        OUT.append(column.name()).append(idx != columns.size() - 1 ? SEP : "")
    }

    OUT.append(KW_VALUES)
    columns.eachWithIndex { column, idx ->
        def value = dataRow.value(column)
        def stringValue = value == null ? KW_NULL : FORMATTER.formatValue(value, column)
        def isStringLiteral = value != null && FORMATTER.isStringLiteral(value, column)
        if (isStringLiteral && DIALECT.getDbms().isMysql()) stringValue = stringValue.replace("\\", "\\\\")

        def isOracleClob = value != null && FORMATTER.getTypeName(value, column) == "CLOB" && DIALECT.getDbms().isOracle()
        if (isOracleClob) {
            stringValue = stringValue
                    .replace(QUOTE, QUOTE + QUOTE)
                    .replaceAll("(.{" + MAX_STRING_SIZE + "})", "\$1" + QUOTE + ') ' + CONCAT_SEPARATOR + CLOB_PREFIX + QUOTE)
            OUT.append(STRING_PREFIX + CLOB_PREFIX + QUOTE)
                    .append(stringValue)
                    .append(QUOTE + ")\n")
                    .append(idx != columns.size() - 1 ? SEP : "")
            return
        }

        OUT.append(isStringLiteral ? (STRING_PREFIX + QUOTE) : "")
                .append(isStringLiteral ? stringValue.replace(QUOTE, QUOTE + QUOTE) : stringValue)
                .append(isStringLiteral ? QUOTE : "")
                .append(idx != columns.size() - 1 ? SEP : "")
    }
    OUT.append(");").append(NEWLINE)
}

ROWS.each { row -> record(COLUMNS, row) }
```