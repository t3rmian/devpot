---
title: IntelliJ merge data extractor for OracleDB
url: intellij-merge-data-extractor-for-oracledb
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

IntelliJ provides a powerful Database extension that simplifies everyday tasks for application developers.
With data extractors, you can quickly extract data using one of the standard formats.
However, because some databases employ custom syntax for more complex operations like upsert,
you will have to either manually craft such an export or create a custom extractor.

<figure class="flex">
<img src="/img/hq/intellij-data-extractors-directory.png" alt="Data extractors from the Database tab in IntelliJ" title="Data extractors from the Database tab in IntelliJ">
<img src="/img/hq/intellij-custom-data-extractor.png" alt="Folder with custom data extractors in IntelliJ" title="Folder with custom data extractors in IntelliJ">
</figure>

Fortunately, IntelliJ data extractor [API](https://www.jetbrains.com/help/idea/data-extractors.html) is simple to the core and, at the same time, covers most of the basics.
You can devise an upsert operation in the OracleDB that uses the
`MERGE` statement. Not delving into the details, the general merge statement in the OracleDB that you are looking for
in your data extractor probably looks like this:

```sql
MERGE INTO <table>
    USING (<query>)
    ON (<condition>)
    WHEN MATCHED THEN UPDATE SET <column_updates>
                          WHEN NOT MATCHED THEN INSERT (<columns>) VALUES (<values>)
```

## Merge data extractor

To not reinvent the wheel, let's start with the `SQL-Insert-Statements.sql.groovy`.
It is an extractor that comes with the IntelliJ and, contrary to the other inbuilt extractors,
exists in the form of a modifiable definition.
You will find it in the Project view tree under *Scratches and Consoles > Extensions > Database Tools and SQL > data > extractors*.
Start with cloning it under the new name like `SQL-Merge-Statements.sql.groovy`

The definition already contains the insert clause and a verified way to extract delimited column values, more precisely,
a way to append them to the output.
You invoke it by copying selected columns from a console result set with a specific extractor selected.
Let's reuse this code and breaking by extracting it into two functions – column value output and an optional delimiter output.

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

However, before we begin the implementation, let's agree on a few conditions, we want:
- to upsert all columns (see comment #1);
- a single source for the merge condition, update and insert, without duplicating the values for each clause (see comment #2);
- to generate the condition through selecting columns from the console result set (#3);
- to correctly handle the NULL comparison (#4);
- to avoid the ORA-38104 error stating that columns referenced in the ON Clause must be skipped in the update clause (#5).

Given such conditions, single record extraction might look like this:

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

With this you can try the export for the pre-created `USER_OBJECTS` table (after replacing the fallback MY_TABLE name –
because the query was on a view):

```sql
MERGE INTO FOO
    USING (SELECT 'PIPELINE$1'                    OBJECT_NAME,
                  NULL                            SUBOBJECT_NAME,
                  69101                           OBJECT_ID,
                  NULL                            DATA_OBJECT_ID,
                  'JOB'                           OBJECT_TYPE,
                  TIMESTAMP '2022-03-27 07:51:29' CREATED,
                  TIMESTAMP '2023-10-08 07:04:09' LAST_DDL_TIME,
                  '2023-10-08:07:04:09'           TIMESTAMP,
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

Generating conditions on the selected columns makes it easier to match some unique constraints.
You can customize it further, e.g., look for a way to use sequences for identifier generation.
Examine the complete code on [this gist](https://gist.github.com/t3rmian/860770e3547a726f1c3cef46499e94bd), and let me know your thoughts.