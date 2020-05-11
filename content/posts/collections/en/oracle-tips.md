# Tips

Few queries which may be helpful during archival/removal implementation and testing:
1. `CREATE TABLE table_backup AS SELECT FROM table_name WHERE...` seems to be one of the fastest ways to create temporary backup for testing.
2. log errors
3. bulk inserts/deletions
4. check tablespace
5. disable foreign keys