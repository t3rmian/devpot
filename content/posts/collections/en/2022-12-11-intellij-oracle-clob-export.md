---
title: IntelliJ Data Exporter for lengthy Oracle CLOBs
url: oracle-clob-intellij-data-extractor
id: 101
category:
  - other: Misc
tags:
  - oracle
  - intellij
  - sqlplus
author: Damian Terlecki
date: 2022-12-11T20:00:00
updated: 2023-12-18T20:00:00
---

Handling CLOB types in Oracle can sometimes be cumbersome.
Several different tools allow importing and exporting such data: SQL*Loader, Data Pump, DBMS_LOB package, and more.

In a purely SQL approach, you can use an implicit cast or the `TO_CLOB` function accepting a VARCHAR2 type parameter.
Some limitations that come with this concept can be explained under the following issues:
- `ORA-01704: string literal too long` – erro caused by using a VARCHAR2 type of length longer than 4000-32767 bytes (exact limit depends on the initialization parameter `MAX_STRING_SIZE`);
- `SP2-0027: Input is too long (> N characters)` – which is an error of the *sqlplus* tool that appears when a line in the script is longer than the internally defined limit (usually some value greater than 2000);
- `SP2-XXXX: Unknown command` – that usually appears in the *sqlplus* for text containing blank lines (can be mitigated with `SET SQLBLANKLINES` command);
- a script waiting for a substitution input that begins with an `&` (popular workaround – `SET DEFINE OFF`). 

A workaround for these problems is to break the values into smaller chunks and concatenate them additionally in separate lines handling special characters.
This solution is described on the popular [Ask Tom forum](https://asktom.oracle.com/pls/apex/f?p=100:11:0::::P11_QUESTION_ID:9523893800346388494).
You will need the SQL*Plus tool for this. But you might not have this at hand so let me show you how to achieve the same thing with the IntelliJ IDE.

## IntelliJ Data Extractor

The Database module in IntelliJ Ultimate 2022 (Menu - View - Tool Windows - Database) performs the basic functions of a full-fledged client
supporting many different databases. After configuring access to the database, you get the ability to, among other things, display and export data from the table.
"Data Extractors" are simple programs that allow you to export data according to a specific format.

<img src="/img/hq/intellij-custom-data-extractor.png" alt="IntelliJ Database Console Output" title="IntelliJ Database Console Output">

By choosing the standard "SQL Insert" extractor, IntelliJ will generate `INSERT` queries with the data extracted from the `SELECT`.
Unfortunately, the text from the CLOB columns will be exported here in one long string. It can lead to the problems described earlier.

<img src="/img/hq/intellij-data-extractors.png" alt="IntelliJ Database Data Extractor menu on the Database Console right side" title="IntelliJ Database Data Extractor">

While browsing the list of extractors, you will find a directory with their implementations.
Actually, you are free to add your own workaround for ORA-01704 and SP2-0027 as a custom extractor.
All you have to do is copy the extractor file under a new name, and it will automatically appear on the list of extractors.

<img src="/img/hq/intellij-data-extractors-directory.png" alt="IntelliJ custom Data Extractor in the extractors directory" title="IntelliJ Data Extractor Copy">

## Groovy SQL Insert Statements

Let's check the non-native `SQL-Insert-Statements.sql.groovy` program. It starts with the definition of the default parameters.
Then there are three important places, indicated by comments below, that implement the extraction logic:
1. Data extraction from rows;
2. Data extraction from columns;
3. Output text (columns).

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

JetBrains provides [documentation](https://www.jetbrains.com/help/idea/data-extractors.html#api_for_custom_data_extractors) to help you write your custom extractor.
First of all, let's start with our own parameters defining separators and the number of characters after which we will put the concatenation.
Let's also define some tricky characters to provide support for *sqlplus*:

```groovy
MAX_STRING_SIZE = 2000
CONCAT_SEPARATOR = ' || '
CLOB_PREFIX = System.lineSeparator() + ' TO_CLOB('
SPECIAL_CHARS = ['\r', '\n', '&']
```

In the next steps:
1. Check if the column is a CLOB type;
2. Swap special characters with `CHR()` concatenation.
3. Start with `TO_CLOB` concatenating it in a new line every `MAX_STRING_SIZE` characters;
4. Append the output string to the `OUT` appender like in the original extractor.

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

For points 2 and 3, I initially used REGEX, but it was somewhat slow.
To swap out some special characters for *sqlplus*, I changed it into a simple iteration over the characters.
It may be crude but is already much faster than the REGEX:

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

Now, by selecting the extractor from the list and copying the rows (or by extracting the entire table), you should get the expected export.
Don't forget to paste as a plain text to skip auto-formatting:
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


## Summary

The final implementation of the CLOB data extractor looks as follows:

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

> Note: I once encountered problem with `DIALECT.getDbms()` returning `MockDbms` and not evaluating to the Oracle. The issue went away after a restart, but you could also remove this condition if you intend to generate such an insert regardless of the source DB dialect.