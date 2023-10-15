---
title: Ekstraktor danych instrukcji MERGE (OracleDB) w IntelliJ
url: intellij-ekstraktor-danych-merge-oracledb
id: 118
category:
  - databases: Databases
tags:
  - intellij
  - oracle
author: Damian Terlecki
date: 2023-10-15T20:00:00
source: https://gist.github.com/t3rmian/860770e3547a726f1c3cef46499e94bd
---

Wbudowana wtyczka do baz danych w IntelliJ, znacznie upraszcza codzienne zadania analityka i programisty aplikacji.
Dzięki ekstraktorom danych możesz szybko wydobyć dane, używając jednego z dostępnych formatów. Jednakże, ponieważ
niektóre bazy danych stosują niestandardową składnię dla bardziej złożonych operacji, takich jak np. *upsert*,
ekstrakcja taka może okazać się nazbyt czasochłonna ze względu na brak wsparcia.

<figure class="flex">
<img src="/img/hq/intellij-data-extractors-directory.png" alt="Ekstraktory danych z zakładki Database w IntelliJ" title="Ekstraktory danych z zakładki Database w IntelliJ">
<img src="/img/hq/intellij-custom-data-extractor.png" alt="Folder ze zdefiniowanymi ekstraktorami danych w IntelliJ" title="Folder ze zdefiniowanymi ekstraktorami danych w IntelliJ">
</figure>

Na szczęście, [interfejs](https://www.jetbrains.com/help/idea/data-extractors.html)
ekstraktora danych w IntelliJ jest dosyć intuicyjne i jednocześnie pozwala na implementację większości podstawowych
przypadków użycia. Wspomnianą operację *upsert* w bazie danych Oracle, przeprowadzilibyśmy zapewne przy użyciu
instrukcji `MERGE`. Ogólna struktura tego polecenia, gdybyśmy chcieli go użyć do ekstrakcji danych np. do skryptu, wygląda tak:

```sql
MERGE INTO <table>
USING (<query>)
ON (<condition>)
WHEN MATCHED THEN UPDATE SET <column_updates>
WHEN NOT MATCHED THEN INSERT (<columns>) VALUES (<values>)
```

## Ekstraktor danych w formie zapytań MERGE

Aby nie wynajdywać koła na nowo, spójrz na plik `SQL-Insert-Statements.sql.groovy`. Jest to ekstraktor dostarczany 
wraz z IntelliJi. W przeciwieństwie do innych wbudowanych ekstraktorów możesz go otworzyć i edytować. Znajdziesz
go w drzewie projektu w sekcji *Scratches and Consoles > Extensions > Database Tools and SQL > data > extractors*.
Zacznij od skopiowania go pod nową nazwą, na przykład `SQL-Merge-Statements.sql.groovy`.

Definicja zawiera już klauzulę INSERT oraz przetestowany sposób wypisywania kolejnych po przecinku wartości kolumn.
Wykorzystajmy ponownie ten kod i rozłóżmy go na dwie funkcje – jedną wypisującą wartość kolumny oraz drugą
dopisującą przecinek bądź inny wybrany znak (np. znak łączący kolejne warunki zapytania).

```groovy
private void appendValue(dataRow, column, idx, columns) {
    def value = dataRow.value(column)
    def stringValue = value == null ? KW_NULL : FORMATTER.formatValue(value, column)
    def isStringLiteral = value != null && FORMATTER.isStringLiteral(value, column)
    if (isStringLiteral && DIALECT.getDbms().isMysql()) stringValue = stringValue.replace("\\", "\\\\")
    OUT.append(isStringLiteral ? (STRING_PREFIX + QUOTE) : "")
            .append(isStringLiteral ? stringValue.replace(QUOTE, QUOTE + QUOTE) : stringValue)
            .append(isStringLiteral ? QUOTE : "")
}

private void appendCharacter(character, idx, columns) {
    OUT.append(idx != columns.size() - 1 ? character : "")
}
```

Przed rozpoczęciem implementacji ustalmy kilka ważnych warunków, wpływających na to, jak będzie ona wyglądała.
Przyjmijmy, że chcemy:
- zaktualizować wszystkie kolumny (patrz komentarz #1);
- użyć jednego źródła dla warunków, instrukcji UPDATE i INSERT, bez duplikowania wartości dla każdej klauzuli (patrz komentarz #2);
- wygenerować warunek poprzez jedynie dla wybranych kolumn z wynikowego zestawu danych wyświetlonych w konsoli (#3);
- poprawnie obsłużyć warunki dla wartości NULL (#4);
- uniknąć błędu ORA-38104, który mówi, że kolumny wymienione w klauzuli ON muszą być pominięte w klauzuli UPDATE (#5).

Biorąc pod uwagę takie warunki, ekstrakcja pojedynczego rekordu może wyglądać w następujący sposób:

```groovy
def record(columns, dataRow) {
    TABLE_NAME = TABLE == null ? "MY_TABLE" : TABLE
    OUT.append("MERGE INTO ").append(TABLE_NAME).append(NEWLINE)
    OUT.append("USING (SELECT ")
    ALL_COLUMNS.eachWithIndex { column, idx -> // #1 select to upsert all columns from a table
        appendValue(dataRow, column, idx, ALL_COLUMNS)
        OUT.append("  ").append(column.name())
        appendCharacter(SEP, idx, ALL_COLUMNS)
    }
    OUT.append(" FROM DUAL) upsert").append(NEWLINE) // #2 alias the source of the condition/update/insert 
    OUT.append("ON (")
    columns.eachWithIndex { column, idx -> // #3 upsert on condition created from selected columns
        OUT.append("(").append(TABLE_NAME).append(".").append(column.name()).append(" = ")
                .append("upsert.").append(column.name()).append(" OR (") // #4 handle nulls in the condition
                .append(TABLE_NAME).append(".").append(column.name()).append(" IS NULL AND ")
                .append("upsert.").append(column.name()).append(" IS NULL))")
        appendCharacter(' AND ', idx, columns)
    }
    OUT.append(")").append(NEWLINE)
    OUT.append(ALL_COLUMNS.stream() // #4 for the update statement, remove columns from the ON clause
            .filter(column -> columns.stream().noneMatch(selectedColumn -> selectedColumn.name().equals(column.name())))
            .map(nonOnReferencedColumn -> nonOnReferencedColumn.name() + " = upsert." + nonOnReferencedColumn.name())
            .reduce((updateColumn, updateColumn2) -> updateColumn + SEP + updateColumn2)
            .map(columnUpdates -> "WHEN MATCHED THEN UPDATE SET " + columnUpdates + NEWLINE)
            .orElse(""))
    OUT.append("WHEN NOT MATCHED THEN INSERT (")
    ALL_COLUMNS.eachWithIndex { column, idx ->
        OUT.append(column.name())
        appendCharacter(SEP, idx, ALL_COLUMNS)
    }
    OUT.append(") VALUES (")
    ALL_COLUMNS.eachWithIndex { column, idx ->
        OUT.append("upsert.").append(column.name())
        appendCharacter(SEP, idx, ALL_COLUMNS)
    }
    OUT.append(");").append(NEWLINE)
}
```

Tak zmodyfikowany ekstraktor pozwoli Ci na testowy eksport z tabelki `USER_OBJECTS` (po podmianie domyślnej nazwy tabeli
`MY_TABLE` wygenerowanej ze względu na to, że zapytanie dotyczyło widoku):

```sql
MERGE INTO FOO
    USING (SELECT 'PIPELINE$1'                    OBJECT_NAME,
                  NULL                            SUBOBJECT_NAME,
                  69101                           OBJECT_ID,
                  NULL                            DATA_OBJECT_ID,
                  'JOB'                           OBJECT_TYPE,
                  TIMESTAMP '2022-03-27 07:51:29' CREATED
--...
           FROM DUAL) upsert
    ON ((FOO.SUBOBJECT_NAME = upsert.SUBOBJECT_NAME OR (FOO.SUBOBJECT_NAME IS NULL AND upsert.SUBOBJECT_NAME IS NULL)) AND
        (FOO.OBJECT_ID = upsert.OBJECT_ID OR (FOO.OBJECT_ID IS NULL AND upsert.OBJECT_ID IS NULL)))
    WHEN MATCHED THEN
        UPDATE
            SET OBJECT_NAME       = upsert.OBJECT_NAME,
                DATA_OBJECT_ID    = upsert.DATA_OBJECT_ID,
                OBJECT_TYPE       = upsert.OBJECT_TYPE,
                CREATED           = upsert.CREATED,
                LAST_DDL_TIME     = upsert.LAST_DDL_TIME,
                TIMESTAMP         = upsert.TIMESTAMP,
--...
    WHEN NOT MATCHED THEN
        INSERT (OBJECT_NAME, SUBOBJECT_NAME, OBJECT_ID, DATA_OBJECT_ID, OBJECT_TYPE, CREATED
--...
                )
        VALUES (upsert.OBJECT_NAME, upsert.SUBOBJECT_NAME, upsert.OBJECT_ID, upsert.DATA_OBJECT_ID
--...
                );
```

Tworzenie warunków na zaznaczonych kolumnach ułatwia dopasowanie *upsertu* do unikalnych ograniczeń.
Ekstraktor możesz dalej dostosować do własnych przypadków użycia.
Możesz na przykład poszukać sposobu zastąpienia identyfikatorów generatorem sekwencji.
Pełny kod znajdziesz [tutaj](https://gist.github.com/t3rmian/860770e3547a726f1c3cef46499e94bd)
i w swej prostocie może nie pasować do każdego przypadku, dlatego zachęcam do dzielenia się spostrzeżeniami.