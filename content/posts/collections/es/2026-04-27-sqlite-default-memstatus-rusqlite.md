---
title: SQLITE_DEFAULT_MEMSTATUS - El mutex de SQLite que no sabías que rusqlite estaba reteniendo
url: sqlite-default-memstatus-rusqlite
id: 129
category:
  - databases: Bases de datos
tags:
  - sql
  - performance
  - native
  - threads
  - sqlite
  - rust
author: Damian Terlecki
date: 2026-04-27T20:00:00
source: https://github.com/rusqlite/rusqlite/blob/v0.39.0/libsqlite3-sys/sqlite3/sqlite3.c#L14723
---

Si integras SQLite en un servicio de Rust mediante `rusqlite` v0.39.0 con la feature `bundled`, `libsqlite3-sys` compila el código fuente de `sqlite3.c` con la opción `SQLITE_DEFAULT_MEMSTATUS=1` activa. Aunque rusqlite pasa una lista de flags `-DSQLITE_*` a la compilación en C, nunca sobrescribe esta en particular, por lo que se mantiene el valor por defecto de SQLite (que es `1`).

Esto coloca cada operación de `sqlite3_malloc` y `sqlite3_free` detrás de un **único mutex global para todo el proceso**.

En un solo hilo nunca lo notarás. Pero con lectores en paralelo y un modelo de conexión por cada petición (per-request), esto puede limitar drásticamente el rendimiento (*throughput*). La solución es una simple variable de entorno en tiempo de compilación.

## Qué hace realmente este flag

SQLite realiza un seguimiento del uso de memoria a nivel de proceso (`sqlite3_memory_used()`, `sqlite3_status()`). Para que estas cifras sean consistentes entre hilos, cada asignación y liberación de memoria actualiza un contador protegido por un mutex. La [documentación de SQLite](https://sqlite.org/compile.html#default_memstatus) incluye `SQLITE_DEFAULT_MEMSTATUS=0` entre las opciones de compilación recomendadas para obtener mayor velocidad:

> Esta configuración desactiva las interfaces de sqlite3_status() que rastrean el uso de memoria. Esto ayuda a que las rutinas sqlite3_malloc() se ejecuten mucho más rápido y, dado que SQLite usa sqlite3_malloc() internamente, ayuda a que toda la biblioteca sea más rápida.

La documentación destaca la velocidad; el mecanismo subyacente es eliminar un mutex global del proceso en cada *alloc* y *free*. Keith Medcalf lo [explicó claramente](https://sqlite.org/forum/forumpost/a4f343b221) en el foro de SQLite: habilitar MEMSTATUS tiene "el efecto secundario de envolver los asignadores de memoria en un mutex (es decir, solo un hilo de ejecución a la vez puede acceder al asignador de memoria)". Establecer `SQLITE_DEFAULT_MEMSTATUS=0` en tiempo de compilación desactiva tanto el contador como el mutex. Las llamadas a malloc/free de C pasan directamente sin bloqueos.

## Quién compila con `=0` y quién no

Existe una asimetría interesante entre los distintos drivers. Aunque el código fuente de SQLite es el mismo, cada ecosistema distribuye su propia compilación:

| Proyecto | SQLITE_DEFAULT_MEMSTATUS | Dónde se configura |
| :--- | :--- | :--- |
| **rusqlite (bundled)** | `=1` (por defecto) | No se sobrescribe |
| **sqlite-jdbc** | `=0` | Makefile.common |
| **node:sqlite (Node)** | `=0` | PR #56541 (Ene 2025) |
| **CPython sqlite3** | `=0` | setup_helpers.py |

Tres de los cuatro principales entornos que usan SQLite embebido desactivan explícitamente el mutex. El de Rust no lo hace.

## Cuándo llega a afectar el rendimiento

Deben cumplirse tres condiciones simultáneamente:

1. **Varios hilos ejecutando código C de SQLite al mismo tiempo.** Por ejemplo, un servicio web con un pool de workers que consultan SQLite bajo carga. El código monohilo nunca llegará a ver el mutex.
2. **Un ciclo de vida de conexión por petición**, o cualquier patrón con alta rotación de asignaciones (parsing, apertura, cierre). Cada `sqlite3_open` parsea el `sqlite_master`, asigna estructuras de esquema y abre un B-tree. Cada cierre lo destruye. Muchas asignaciones pequeñas por petición equivalen a muchas adquisiciones del mutex por petición.
3. **Suficientes núcleos para que el mutex realmente compita.** En un contenedor de 1-2 vCPUs con baja concurrencia, la diferencia será apenas ruido estadístico.

Me topé con esto en un Ryzen de 16 hilos con un servicio de Rust + `axum` que abría una `Connection` nueva por cada petición. Con 50 usuarios concurrentes en un endpoint de una sola fila, el rendimiento era de **5,622 req/s**. Al analizar con `perf record -g`, vi que un ~18% del CPU se perdía en `__lll_lock_wake/wait` originado en `sqlite3_malloc`. Tras cambiar el flag: el rendimiento subió a **30,737 req/s** y el bloqueo por futex desapareció.

<img class="uml-bg" loading="lazy" src="/img/hq/sqlite-default-memstatus-rusqlite-es.svg" alt="Dos hilos de trabajo ejecutando cada uno un malloc dentro de SQLite, ambos bloqueados por el mismo mutex global mem0" title="Por qué un mutex global serializa N lectores paralelos">

## Cómo cambiarlo en tu app de Rust

Si dependes de rusqlite con la feature `bundled`, cargo compilará el SQLite embebido por ti:

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.39", features = ["bundled"] }
```

No existe una "feature" en `Cargo.toml` para conmutar `SQLITE_DEFAULT_MEMSTATUS`. La solución oficial, documentada en el [README de rusqlite](https://github.com/rusqlite/rusqlite/blob/v0.39.0/README.md#notes-on-building-rusqlite-and-libsqlite3-sys), es usar la variable de entorno `LIBSQLITE3_FLAGS`. El lugar más limpio para fijarla es en `.cargo/config.toml`, que configura variables de entorno para cada `cargo build` / `test` / `run` en el workspace:

```toml
# .cargo/config.toml
[env]
LIBSQLITE3_FLAGS = "SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
```

Al incluir este archivo en tu repositorio, cualquier colaborador o entorno de CI heredará el flag sin configuración extra. Como cargo emite `cargo:rerun-if-env-changed=LIBSQLITE3_FLAGS`, editar el valor reconstruirá `libsqlite3-sys` automáticamente (no hace falta un `cargo clean`).

También puedes hacerlo de forma ad-hoc desde la terminal:

```bash
export LIBSQLITE3_FLAGS="SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
cargo build --release
```

Puedes verificar que el flag surtió efecto consultando las opciones de compilación en tiempo de ejecución:

```rust
let flags: Vec<String> = conn
    .prepare("SELECT * FROM pragma_compile_options();")?
    .query_map([], |r| r.get(0))?
    .collect::<Result<_, _>>()?;
```

Curiosamente, una compilación por defecto de rusqlite NO mostrará `DEFAULT_MEMSTATUS`. Esto es porque `pragma_compile_options()` de SQLite solo muestra las opciones cuyo valor difiere del valor por defecto original. Una vez que cambies a `=0`, la entrada `DEFAULT_MEMSTATUS=0` aparecerá en la lista.

## Trade-offs

Al establecer el valor en `0`, `sqlite3_memory_used()` y `sqlite3_status()` devolverán cero. Si tu código depende de estas funciones (pocos lo hacen, ya que es una API de introspección para debugging), este flag las deshabilitará.

No hay impacto en la integridad de los datos. Las asignaciones y liberaciones siguen ocurriendo; solo se elimina el contador de seguimiento. Este flag es el mismo con el que ya vienen configurados `sqlite-jdbc`, Node y CPython, por lo que al activarlo te estarás alineando con los estándares de producción más comunes.

> Consulta el hilo del foro de SQLite sobre [SQLITE_DEFAULT_MEMSTATUS](https://sqlite.org/forum/forumpost/021b434e7a) para leer la discusión original.