---
title: SQLITE_DEFAULT_MEMSTATUS - o mutex do SQLite que você não sabia que o rusqlite estava segurando
url: sqlite-default-memstatus-rusqlite
id: 129
category:
  - databases: Bancos de Dados
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

Se você utiliza o SQLite em um serviço Rust através do `rusqlite` v0.39.0 com a feature `bundled`, a biblioteca `libsqlite3-sys` compila o código fonte `sqlite3.c` com a flag `SQLITE_DEFAULT_MEMSTATUS=1` ativa. O rusqlite passa uma lista de flags `-DSQLITE_*` para o build em C, mas nunca sobrescreve esta especificamente, então o padrão do SQLite (que é `1`) permanece.

Isso coloca cada chamada de `sqlite3_malloc` e `sqlite3_free` atrás de um **único mutex global para todo o processo**.

Em uma única thread, você nunca sentirá isso. Mas com leitores paralelos e um modelo de conexão por requisição (*per-request*), isso pode limitar severamente o seu throughput. A solução é apenas uma variável de ambiente em tempo de build.

## O que essa flag realmente faz

O SQLite rastreia o uso de memória de todo o processo (`sqlite3_memory_used()`, `sqlite3_status()`). Para manter esses números consistentes entre várias threads, cada alocação e liberação de memória atualiza um contador protegido por um mutex. A [documentação do SQLite](https://sqlite.org/compile.html#default_memstatus) lista `SQLITE_DEFAULT_MEMSTATUS=0` entre as opções de compilação recomendadas para performance:

> Esta configuração faz com que as interfaces sqlite3_status() que rastreiam o uso de memória sejam desativadas. Isso ajuda as rotinas sqlite3_malloc() a rodarem muito mais rápido e, como o SQLite usa sqlite3_malloc() internamente, ajuda a tornar toda a biblioteca mais rápida.

A documentação foca na velocidade; o mecanismo por trás disso é remover um mutex global do processo de cada *alloc* e *free*. Keith Medcalf [foi direto ao ponto](https://sqlite.org/forum/forumpost/a4f343b221) no fórum do SQLite: habilitar o MEMSTATUS tem "o efeito colateral de envolver os alocadores de memória em um mutex (ou seja, apenas uma thread de execução por vez pode acessar o alocador de memória)". Definir `SQLITE_DEFAULT_MEMSTATUS=0` no tempo de compilação desativa o contador e o mutex. As chamadas de malloc/free em nível C passam direto.



## Quem compila com `=0` e quem não

Existe uma assimetria interessante entre os drivers. O código C do SQLite é o mesmo, mas cada ecossistema entrega seu próprio build:

| Projeto | SQLITE_DEFAULT_MEMSTATUS | Onde é definido |
| :--- | :--- | :--- |
| **rusqlite (bundled)** | `=1` (padrão upstream) | Não sobrescrito |
| **sqlite-jdbc** | `=0` | Makefile.common |
| **node:sqlite (Node)** | `=0` | PR #56541 (Jan 2025) |
| **CPython sqlite3** | `=0` | setup_helpers.py |

Três das quatro principais formas de usar SQLite embutido desativam explicitamente o mutex. A do Rust não.

## Quando o padrão realmente incomoda

Três condições precisam acontecer juntas:

1.  **Múltiplas threads dentro do código C do SQLite ao mesmo tempo.** Um serviço web com um pool de workers que chama o SQLite sob carga. Código single-threaded nunca verá o mutex.
2.  **Um ciclo de vida de conexão por requisição**, ou qualquer padrão com alta rotatividade de alocação — parsing, abertura, fechamento. Cada `sqlite3_open` analisa o `sqlite_master`, aloca estruturas de esquema, abre uma B-tree. Cada fechamento destrói tudo. Muitas alocações pequenas por requisição -> muitas requisições de mutex por requisição.
3.  **Núcleos de CPU suficientes para o mutex realmente competir.** Em um container de 1-2 vCPUs com baixa concorrência, a diferença é apenas ruído.

Eu encontrei esse problema em um Ryzen de 16 threads com um serviço Rust + `axum` que abria uma `Connection` nova por requisição. Com 50 usuários simultâneos em um endpoint de uma única linha, o throughput era de **5.622 req/s** e o `perf record -g` mostrava cerca de 18% do CPU em `__lll_lock_wake/wait` originados no `sqlite3_malloc`. Com a flag alterada: **30.737 req/s** e o rastro do futex sumiu.

<img class="uml-bg" loading="lazy" src="/img/hq/sqlite-default-memstatus-rusqlite-pt.svg" alt="Duas threads de trabalho, cada uma executando um malloc dentro do SQLite, ambas travadas no mesmo mutex global mem0" title="Por que um único mutex global serializa N leitores paralelos">

## Como alterar no seu app Rust

Você depende do rusqlite da forma usual — feature `bundled` ativa, para que o cargo compile o SQLite para você:

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.39", features = ["bundled"] }
```

Não existe uma feature no `Cargo.toml` que alterne o `SQLITE_DEFAULT_MEMSTATUS`. A saída oficial, documentada no [README do rusqlite](https://github.com/rusqlite/rusqlite/blob/v0.39.0/README.md#notes-on-building-rusqlite-and-libsqlite3-sys), é uma variável de ambiente chamada `LIBSQLITE3_FLAGS`. O lugar mais limpo para fixá-la no seu projeto é no arquivo `.cargo/config.toml`, que define variáveis de ambiente para cada `cargo build` / `cargo test` / `cargo run` no workspace:

```toml
# .cargo/config.toml
[env]
LIBSQLITE3_FLAGS = "SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
```

Comite esse arquivo junto com o `Cargo.toml`. Cada contribuidor e cada runner de CI que buildar seu app herdará a flag sem configuração extra; o cargo emite `cargo:rerun-if-env-changed=LIBSQLITE3_FLAGS`, então editar o valor reconstrói o `libsqlite3-sys` automaticamente (sem precisar de `cargo clean`).

Você também pode fazer isso via terminal na hora do build:

```bash
export LIBSQLITE3_FLAGS="SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
cargo build --release
```

Verifique se a flag funcionou consultando as opções de compilação em runtime:

```rust
let flags: Vec<String> = conn
    .prepare("SELECT * FROM pragma_compile_options();")?
    .query_map([], |r| r.get(0))?
    .collect::<Result<_, _>>()?;
```

Contra-intuitivamente, um build padrão do rusqlite NÃO lista o `DEFAULT_MEMSTATUS` — o `pragma_compile_options()` do SQLite só mostra opções cujos valores são diferentes do padrão original. Depois que você mudar para `=0`, a entrada `DEFAULT_MEMSTATUS=0` aparecerá no output.

## Trade-offs

Definir `=0` faz com que `sqlite3_memory_used()` e `sqlite3_status()` retornem zero. Se o seu código depende disso (pouquíssimas aplicações dependem; é uma API de introspecção para debugging), esta flag irá quebrá-los.

Não há impacto na correção dos dados. As alocações continuam acontecendo, as liberações também; apenas o contador de contabilidade desaparece. Esta flag é a mesma que o `sqlite-jdbc`, Node e a stdlib do Python já utilizam — portanto, ao alterá-la, você está se alinhando à configuração de produção mais comum, e não se desviando dela.

> Veja a discussão no fórum do SQLite sobre [SQLITE_DEFAULT_MEMSTATUS](https://sqlite.org/forum/forumpost/021b434e7a) para mais detalhes.