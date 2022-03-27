---
title: Database archiving
url: database-archiving
id: 11
category:
  - databases: Databases
tags:
  - oracle
author: Damian Terlecki
date: 2019-08-25T20:00:00
---

Large systems with high activity are prone to losing performance over time. This is the case in the majority of legacy projects, especially in the long-running ones
with high user-base. It's not a big discovery — user data increases, tablespace expands, the number of entities inflates from few millions to few billions and the size of indexes grow. Database queries (if properly indexed) are not taking that long to finish but it's not the time of their splendor either. You could even say that the system behaves normally but then comes one day, users flood the service due to some fancy event, and... it chokes.

Database archiving is not a simple process. It's not done overnight. It's a good idea to consider it during project analysis for achieving stable performance later on. You also might want to keep the cost of running the database on a more or less stable level. If you take users into consideration, it's also best to minimize changes or introduce them early on. Nevertheless, when you're put on the spot, where performance increase is needed for yesterday, you've got to choose from a few options:
- optimize application code;
- optimize database queries;
- optimize database structure (indexes, partitions, tables);
- archive data;
- redefine use cases.

If you consider data archival you have furthermore two choices:
- moving data to external data sources and storages;
- in-database archiving.
Note that database archiving must be highly connected with optimizing the structures, otherwise the performance gain might be minimal or even none.

### Moving data to another destination

Easiest option to improve the performance or decrease database size is to move the data to a different place. Generally you could use an archival table which could later be compressed to reduce the database size. Though, the most popular option is to move it to a different storage or data warehouse in a denormalized state. Also, a valid option is to remove some data which has been created due to a mistake.

Keep in mind though, that if you already have some indexes set up for your table, removal of the records will effectively increase the fragmentation. To check the fragmentation you can query the `sys.dm_db_index_physical_stats`. Depending on the fragmentation level you can use one of the two methods to correct it:
- fragmentation <5%-10%; 30%) — reorganize `ALTER INDEX index_name REORGANIZE;` (always online, not available with Oracle);
- fragmentation <30%; 100%) — rebuild `ALTER INDEX REBUILD [ONLINE];`.
If you have a spatial partitioned index, you will have to use `ALTER INDEX index_name REBUILD PARTITION partition_name;` query. To display table indexes call `SELECT * FROM all_indexes;`, and to check partition names `SELECT * FROM ALL_TAB_PARTITIONS;`.

### Oracle in-database archiving

Oracle is one of the more popular databases. In 12c Oracle has introduced a feature called in-database archiving. This is a pretty interesting feature. Basically, you apply the it to a chosen table and Oracle creates an additional column `ora_archive_state` initialized with value 0. This value means that the row is not archived. Setting this column to any other value will effectively mark the row as archived. Archived row is essentially:
- not visible by default `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ACTIVE;`
- visible after setting session attribute `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ALL;`
- `ora_archive_state` column is automatically added to the queries with value depending on the visibility value.

Enabling and disabling in-database archival is done using two commands:
```sql
ALTER TABLE table_name ROW ARCHIVAL;
ALTER TABLE table_name NO ROW ARCHIVAL;
```
Note that enabling the archival is pretty quick, however, disabling it (which removes the archival state column) can take up to an hour for tables with few hundred millions of records. Let me tell you another scary thing. Oracle in-database archiving disregards any foreign key constraints. Actually, the records are not being deleted, so it's a logical result. However, by default, archived data will not be visible in your application and if you have any relations to the records you might get surprised when you start seeing **internal errors**.

This is the moment when you will need to analyze how your tables are linked and maybe archive them together. Hopefully, you're not trying to archive your core table, as they are probably linked to every other table. That's why this process might seem easy, but in reality, is pretty complex. Of course, there is an option to access this archived data with session attribute. This way it's possible to retain the visibility of archived data in selected places by altering the session.

Bear in mind, however, that when using any connection pool, after closing the connection it goes back to the pool with an altered session, effectively infecting the connection pool and making the archival meaningless. So, the safe approach would be to alter the session back before closing it (as far as JDBC Connection is not shared between threads which should be generally true) or even safer — to prepare a separate data source with its own connection pool for archival visibility usage.

### Improving after archival performance

Have you come up to this point? You've archived the data, ran some performance tests and have seen that there is no visible performance increase? Well, if you check the execution plan for pre and post archived data (in-database archive) you will see that there is no real improvement. The data has not really been removed, and archived rows are still considered during full scans. You haven't added the archival state column to the index either. Well, I don't blame you, depending on the number of indexes and additional constraints it might be really tiresome.

There is another way to improve the performance which especially suits in-database archiving — table partitioning. This feature is a double edged-sword:
> Partitioning can drastically improve performance on a table when done right, but if done wrong or when not needed, it can make performance worse, even unusable. [[severalnines.com]](https://severalnines.com/database-blog/guide-partitioning-data-postgresql)

The reason for that is, queries over multiple partitions tend to be slower than the ones executed on a single tablespace. If you partition on wrong column and your typical use cases will ignore your thoughtful preparation, your system will inevitably lose performance. Contrary to that, if your table is very big in size, the indexes increase in size as well. It will be harder to load them into the RAM. In a such case, partitioning should lower the size of the index to fit more easily into the memory.

In the case of in-database archiving `ora_archive_state` is a potential candidate for a partition key. Most of the time you will be querying for active, non-archived data. The optimizer should not search in partitions that do not have relevant information. System components which require access to the archived data will perform slower. However, by correctly indicating the access to the old data in the interface, rather than deleting the data, users will be more forgiving and understanding. Partitions with archived records could be furthermore compressed if you don't care about performance but follow the principle that every byte saved is a penny earned.

To create table partitioned on archive state column, you can use something like (usage of subpartitions in case of partitioning by a different column is also possible):
```sql
CREATE TABLE table_name (
  --...
)
  ROW ARCHIVAL
  ENABLE ROW MOVEMENT
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  );
```

If you have already created the table but it's not partitioned yet, it's possible to [convert it to a partitioned table](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/vldbg/evolve-nopartition-table.html#GUID-5FDB7D59-DD05-40E4-8AB4-AF82EA0D0FE5):
```sql
ALTER TABLE table_name MODIFY
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  ) [ONLINE];
```

The most complex case is when the table is already partitioned. In such a situation you have two options:
1. [Partitioning an Existing Table using DBMS_REDEFINITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table)
2. [Partitioning an Existing Table using EXCHANGE PARTITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table-using-exchange-partition)