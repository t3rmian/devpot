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
updated: 2023-12-18T20:00:00
---

Zarządzanie danymi tekstowymi pod postacią CLOB w Oracle nie jest zbyt wygodne.
Można wymienić kilka różnych narzędzi pozwalających na import i eksport takich danych: SQL\*Loader, Data Pump, pakiet DBMS_LOB.

Gdy jednak potrzebujemy czysto SQLowego podejścia, możemy skorzystać z niejawnego rzutowania bądź funkcji `TO_CLOB` przyjmującej jako parametr typ VARCHAR2.
Dwa ograniczenia związane z tą koncepcją można wylistować pod postacią błędów:
- `ORA-01704: string literal too long` – czyli użycie tekstu typu VARCHAR2 o długości większej niż 4000-32767 bajtów (w zależności od parametru inicjalizacyjnego `MAX_STRING_SIZE`);
- `SP2-0027: Input is too long (> N characters)` – czyli błędu narzędzia *sqlplus* pojawiającego się, gdy linia w skrypcie jest dłuższa niż wewnętrzny limit narzędzia (zazwyczaj limit większy niż 2000);
- `SP2-XXXX: Unknown command` – błędy *sqlplus* dla tekstu zawierającego puste linie (do obejćia poleceniem `SET SQLBLANKLINES`);
- w postaci skryptu oczekującego na wprowadzenie danych do podstawienia rozpoczynającego się od znaku `&` (obejćie poleceniem `SET DEFINE OFF`).

Obejściem tych problemów jest rozbicie wartości na mniejsze kawałki i konkatenacja dodatkowo w oddzielnych liniach z uwzględnieniem znaków specjalnych.
Rozwiązanie to opisane jest na popularnym [forum Ask Tom](https://asktom.oracle.com/pls/apex/f?p=100:11:0::::P11_QUESTION_ID:9523893800346388494).
Potrzebujemy do tego narzędzia SQL Developer, jednak tutaj opiszę, jak możemy obejść się bez niego pod warunkiem, że pracujemy ze środowiskiem IntelliJ.

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

## Groovy SQL Insert Statements

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
Przede wszystkim przyda się zdefiniowanie własnych parametrów określających separatory oraz liczbę znaków, po której wywołamy konkatenację.
Zdefiniujmy także kilka specjalnych znaków, których nie trawi *sqlplus*:

```groovy
MAX_STRING_SIZE = 2000
CONCAT_SEPARATOR = ' || '
CLOB_PREFIX = '\n TO_CLOB('
```

W kolejnych punktach:
1. Sprawdzamy, czy kolumna jest typu CLOB;
3. Wypisujemy ostateczna wartość kolumny, pamiętając o domknięciu nawiasów.
3. Zaczynając od funkcji `TO_CLOB`, co `MAX_STRING_SIZE` znaków, dodajemy zamianę części tekstu na CLOB;
4. Rezultat dopisujemy do *appendera* pod zmienną `OUT`.

```groovy
        /*...*/
        if (isStringLiteral && DIALECT.getDbms().isMysql()) stringValue = stringValue.replace("\\", "\\\\")

        def isOracleClob = value != null &&
                "CLOB".equalsIgnoreCase(FORMATTER.getTypeName(value, column)) &&
                DIALECT.getDbms().isOracle() // #1
        if (isOracleClob) {
            stringValue = prepareClobContent(stringValue) // #2/3
            OUT.append(STRING_PREFIX + CLOB_PREFIX + QUOTE) // #3/4
                    .append(stringValue)
                    .append(QUOTE).append(")").append(System.lineSeparator())
                    .append(idx != columns.size() - 1 ? SEP : "")
            return
        }
        
        OUT.append(isStringLiteral ? (STRING_PREFIX + QUOTE) : "")
        /*...*/
```

Do implementacji punktów 2 i 3 początkowo użyłem REGEX, ale ekstrakcja była nieco powolna dla dłuższych tekstów.
Aby zamienić znaki specjalne wykluczając możliwość wstawienia nowej linii w nieodpowiednim miejscu, przeszedłem na prostą iterację po znakach.
Ta doosyć prymitywna implementacji okazała się zadowalająco szybka szczególnie względem REGEXu:


```groovy
def prepareClobContent(originalString) {
    def result = new StringBuilder()
    def lineLength = 0
    originalString.each { character ->
        def characterString = mapSpecialCharacter(character) // #2
        if (lineLength + characterString.length() >= MAX_STRING_SIZE) { // #3
            result.append(QUOTE).append(') ').append(CONCAT_SEPARATOR)
                    .append(CLOB_PREFIX).append(QUOTE)
            lineLength = 0
        }
        result.append(characterString)
        lineLength += characterString.length()
    }
    return result.toString()
}

def String mapSpecialCharacter(String character) {
    if (character == QUOTE) {
        return character + character
    } else if (SPECIAL_CHARS.contains(character)) {
        return QUOTE + CONCAT_SEPARATOR + 'CHR(' +
                Character.codePointAt(character, 0) + ')' +
                CONCAT_SEPARATOR + QUOTE
    } else {
        return character
    }
}
```

Teraz wybierając ekstraktor z listy i kopiując wiersze (bądź korzystając z ekstrakcji całej tabeli), otrzymamy oczekiwany eksport.
Przy wklejaniu pamiętaj o wklejaniu w trybie zwykłego tekstu i pominięciu autoformatowania.

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
CLOB_PREFIX = System.lineSeparator() + ' TO_CLOB('
SPECIAL_CHARS = ['\r', '\n', '&']

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

        def isOracleClob = value != null && "CLOB".equalsIgnoreCase(FORMATTER.getTypeName(value, column)) && DIALECT.getDbms().isOracle()// #1
        if (isOracleClob) {
            stringValue = prepareClobContent(stringValue) // #2/3
            OUT.append(STRING_PREFIX + CLOB_PREFIX + QUOTE) // #3/4
                    .append(stringValue)
                    .append(QUOTE).append(")").append(System.lineSeparator())
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

def prepareClobContent(originalString) {
    def result = new StringBuilder()
    def lineLength = 0
    originalString.each { character ->
        def characterString = mapSpecialCharacter(character) // #2
        if (lineLength + characterString.length() >= MAX_STRING_SIZE) { // #3
            result.append(QUOTE).append(') ').append(CONCAT_SEPARATOR).append(CLOB_PREFIX).append(QUOTE)
            lineLength = 0
        }
        result.append(characterString)
        lineLength += characterString.length()
    }
    return result.toString()
}

def String mapSpecialCharacter(String character) {
    if (character == QUOTE) {
        return character + character
    } else if (SPECIAL_CHARS.contains(character)) {
        return QUOTE + CONCAT_SEPARATOR + 'CHR(' + Character.codePointAt(character, 0) + ')' + CONCAT_SEPARATOR + QUOTE
    } else {
        return character
    }
}

ROWS.each { row -> record(COLUMNS, row) }
```

> Uwaga: W jednej ze starszych wersji IDE napotkałem na problem polegający na tym, że polecenie `DIALECT.getDbms()` zwracało `MockDbms` zamiast Oracle. Tym samym generowany był tekst o domyślnym typie zamiast CLOB. Problem zniknął po ponownym uruchomieniu IDE, ale równie dobrze możesz pozbyć się tego warunku, jeśli nie planujesz implementacji wspierającej wiele różnych typów baz docelowych.

Dzięki temu ekstraktorowi danych wygenerujesz, *ad hoc*, eksport kolumn typu CLOB bezpośrednio z IntelliJ.
Eksport nie jest limitowany maksymalnym rozmiarem dla typu *varchar* i wspiera znaki specjalne, przy czym tylko dla kolumn CLOB.
Dalej możemy też zastanowić się nad rozszerzeniem przykładu o pozostałe typy danych, a nawet podpiąć własne funkcje bazodanowe.
