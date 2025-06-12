---
title: Archivado de bases de datos
url: database-archiving
id: 11
category:
  - databases: Bases de datos
tags:
  - oracle
author: Damian Terlecki
date: 2019-08-25T20:00:00
---

Los sistemas grandes y con mucha actividad tienden a perder rendimiento con el tiempo. Esto ocurre en la mayoría de los proyectos legacy, especialmente los de larga duración y con muchos usuarios. No es ningún descubrimiento: los datos de usuario crecen, el tablespace se expande, el número de entidades pasa de unos pocos millones a miles de millones y el tamaño de los índices aumenta. Las consultas (si están bien indexadas) no tardan tanto, pero tampoco es su época dorada. Incluso podrías decir que el sistema se comporta "normal" hasta que un día, por algún evento, los usuarios saturan el servicio y... se ahoga.

El archivado de bases de datos no es un proceso sencillo ni se hace de la noche a la mañana. Es buena idea considerarlo durante el análisis del proyecto para lograr un rendimiento estable a largo plazo. También puede ayudarte a mantener el coste de operación de la base de datos en un nivel más o menos estable. Si piensas en los usuarios, lo mejor es minimizar los cambios o introducirlos pronto. Sin embargo, cuando te ves obligado a mejorar el rendimiento "para ayer", tienes varias opciones:
- optimizar el código de la aplicación;
- optimizar las consultas a la base de datos;
- optimizar la estructura de la base (índices, particiones, tablas);
- archivar datos;
- redefinir casos de uso.

Si consideras el archivado de datos, tienes dos opciones:
- mover los datos a fuentes o almacenamientos externos;
- archivado dentro de la base de datos.
Ten en cuenta que el archivado debe ir de la mano de la optimización de estructuras, si no la mejora puede ser mínima o nula.

### Mover datos a otro destino

La opción más sencilla para mejorar el rendimiento o reducir el tamaño de la base es mover los datos a otro lugar. Generalmente puedes usar una tabla de archivo que luego se puede comprimir para reducir el tamaño. Aunque lo más habitual es moverlos a otro almacenamiento o data warehouse en estado desnormalizado. También es válido eliminar datos creados por error.

Eso sí, si ya tienes índices en la tabla, eliminar registros aumentará la fragmentación. Para comprobarla puedes consultar `sys.dm_db_index_physical_stats`. Según el nivel de fragmentación puedes usar:
- fragmentación <5%-10%; 30%) — reorganizar `ALTER INDEX index_name REORGANIZE;` (siempre online, no disponible en Oracle);
- fragmentación <30%; 100%) — reconstruir `ALTER INDEX REBUILD [ONLINE];`.
Si tienes un índice particionado espacialmente, usa `ALTER INDEX index_name REBUILD PARTITION partition_name;`. Para ver los índices: `SELECT * FROM all_indexes;`, y para ver particiones: `SELECT * FROM ALL_TAB_PARTITIONS;`.

### Archivado interno en Oracle

Oracle es una de las bases más populares. En la versión 12c introdujo el archivado interno. Es una función interesante: la aplicas a una tabla y Oracle crea una columna extra `ora_archive_state` inicializada a 0. Este valor significa que la fila no está archivada. Si le pones otro valor, la marca como archivada. Una fila archivada es:
- no visible por defecto `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ACTIVE;`
- visible tras cambiar el atributo de sesión `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ALL;`
- la columna `ora_archive_state` se añade automáticamente a las consultas según la visibilidad.

Activar y desactivar el archivado interno se hace con dos comandos:
```sql
ALTER TABLE table_name ROW ARCHIVAL;
ALTER TABLE table_name NO ROW ARCHIVAL;
```
Ten en cuenta que activarlo es rápido, pero desactivarlo (que elimina la columna) puede tardar hasta una hora en tablas con cientos de millones de registros. Otro detalle: el archivado interno de Oracle ignora las claves foráneas. En realidad, los registros no se borran, así que es lógico. Pero por defecto, los datos archivados no serán visibles en tu app y si tienes relaciones podrías llevarte sorpresas con **errores internos**.

En ese momento tendrás que analizar cómo están enlazadas tus tablas y quizá archivarlas juntas. Ojalá no estés archivando una tabla central, porque seguramente está relacionada con todas las demás. Por eso, aunque parezca fácil, en la práctica es complejo. Por supuesto, puedes acceder a los datos archivados cambiando el atributo de sesión. Así puedes mantener la visibilidad de los datos archivados en sitios concretos alterando la sesión.

Eso sí, si usas un pool de conexiones, al cerrar la conexión vuelve al pool con la sesión alterada, "infectando" el pool y haciendo inútil el archivado. Así que lo seguro es restaurar la sesión antes de cerrar (siempre que la conexión JDBC no se comparta entre hilos, que debería ser lo normal) o mejor aún, usar un datasource separado con su propio pool para acceder a los datos archivados.

### Mejorar el rendimiento tras archivar

¿Has llegado hasta aquí? Archivaste los datos, hiciste pruebas y no ves mejora. Si revisas el plan de ejecución antes y después del archivado interno, verás que no hay mejora real. Los datos no se han eliminado y las filas archivadas siguen contando en los full scan. Tampoco indexaste la columna de archivado. No te culpo, según el número de índices y restricciones puede ser muy tedioso.

Hay otra forma de mejorar el rendimiento, especialmente útil con archivado interno: la partición de tablas. Es un arma de doble filo:
> La partición puede mejorar mucho el rendimiento si se hace bien, pero si se hace mal o no es necesaria, puede empeorar el rendimiento, incluso hacerlo inutilizable. [[severalnines.com]](https://severalnines.com/database-blog/guide-partitioning-data-postgresql)

La razón es que las consultas sobre varias particiones suelen ser más lentas que sobre una sola tabla. Si particionas por la columna equivocada y tus casos de uso típicos ignoran tu preparación, el sistema perderá rendimiento. Por el contrario, si la tabla es muy grande, los índices también crecen y cuesta más cargarlos en RAM. En ese caso, la partición debería reducir el tamaño del índice y facilitar su carga en memoria.

En el caso del archivado interno, `ora_archive_state` es un buen candidato para la clave de partición. La mayoría de las veces consultarás datos activos, no archivados. El optimizador no buscará en particiones sin datos relevantes. Los componentes que requieran acceso a los datos archivados irán más lentos. Pero si indicas bien el acceso a los datos antiguos en la interfaz, en vez de borrarlos, los usuarios lo entenderán mejor. Las particiones con registros archivados pueden comprimirse si no te importa el rendimiento y sigues la filosofía de que cada byte ahorrado es un céntimo ganado.

Para crear una tabla particionada por la columna de archivado:
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

Si ya tienes la tabla creada pero no está particionada, puedes [convertirla a particionada](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/vldbg/evolve-nopartition-table.html#GUID-5FDB7D59-DD05-40E4-8AB4-AF82EA0D0FE5):
```sql
ALTER TABLE table_name MODIFY
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  ) [ONLINE];
```

El caso más complejo es cuando la tabla ya está particionada. En ese caso tienes dos opciones:
1. [Particionar una tabla existente usando DBMS_REDEFINITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table)
2. [Particionar una tabla existente usando EXCHANGE PARTITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table-using-exchange-partition)
