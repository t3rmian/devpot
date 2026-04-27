---
title: SQLITE_DEFAULT_MEMSTATUS - rusqliteが（密かに）握りしめているSQLiteのグローバルミューテックス
url: sqlite-default-memstatus-rusqlite
id: 129
category:
  - databases: データベース
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

Rustサービスで v0.39.0 `rusqlite` の `bundled` 機能を使ってSQLiteを組み込むと、`libsqlite3-sys` は `SQLITE_DEFAULT_MEMSTATUS=1` が有効な状態で `sqlite3.c` をコンパイルする。rusqliteはCのビルド時に `-DSQLITE_*` フラグをいくつか渡すが、このフラグだけは上書きしないため、SQLiteのアップストリームのデフォルト値である `1` がそのまま生き残る。

これによって、すべての `sqlite3_malloc` と `sqlite3_free` が、**プロセス全体で単一のミューテックス**にガードされることになる。

シングルスレッドなら気付くことはないが、並列リーダー（parallel readers）を使い、リクエストごとにコネクションを張るようなモデルだと、これがスループットの強烈なボトルネックになり得る。解決策は、ビルド時の環境変数を一つ設定するだけだ。

## このフラグの正体

SQLiteはプロセス全体でのメモリ使用量を計測している（`sqlite3_memory_used()` や `sqlite3_status()`）。この数値をスレッド間で一貫させるために、メモリの確保・解放が行われるたびにミューテックスを確保してカウンターを更新しているのだ。[SQLiteの公式ドキュメント](https://sqlite.org/compile.html#default_memstatus)でも、パフォーマンス向上のための推奨オプションとして `SQLITE_DEFAULT_MEMSTATUS=0` が挙げられている。

> この設定を無効にすると、メモリ使用量を追跡する sqlite3_status() インターフェースがオフになる。これにより sqlite3_malloc() ルーチンの実行が大幅に速くなり、内部的に sqlite3_malloc() を利用している SQLite ライブラリ全体の高速化につながる。

ドキュメントでは「速くなる」とだけ書かれているが、その裏にあるメカニズムは、メモリ割り当てのたびに走るプロセスグローバルのミューテックスを排除することにある。Keith Medcalf氏が[SQLiteフォーラムで断言している](https://sqlite.org/forum/forumpost/a4f343b221)通り、MEMSTATUSが有効だと「メモリアロケータがミューテックスでラップされる副作用（つまり、一度に一つのスレッドしかアロケータにアクセスできない）」が発生する。コンパイル時に `0` をセットすれば、カウンターとミューテックスは無効化され、Cレベルの malloc/free が直接実行されるようになる。

## 各エコシステムでの設定状況

面白いのは、ドライバによってこの設定がバラバラな点だ。同じSQLiteのソースを使っていても、各言語のビルド設定は以下のようになっている。

```
プロジェクト              SQLITE_DEFAULT_MEMSTATUS    設定場所
rusqlite (bundled)      =1 (デフォルト)               上書きなし
sqlite-jdbc             =0                          Makefile.common
node:sqlite (Node)      =0                          PR #56541 (Jan 2025)
CPython sqlite3         =0                          setup_helpers.py
```

主要な組み込みSQLite環境のうち、3つは明確にこのミューテックスを無効化しているが、Rust（rusqlite）だけがデフォルトのまま残されている。

## デフォルト設定が牙を剥く条件

以下の3つが揃ったとき、この問題が顕在化する。

1.  **複数のスレッドが同時にSQLiteのCコード内にいる。** 負荷のかかっているWebサービスのワーカープールなど。シングルスレッドならこのミューテックスは見えない。
2.  **リクエストごとの接続ライフサイクル**、あるいはパースやオープン・クローズが頻繁に走るパターン。`sqlite3_open` のたびに `sqlite_master` がパースされ、スキーマ構造が割り当てられ、B-treeが開かれる。クローズ時にはそれらが破棄される。この大量の小さなアロケーションが、リクエストあたりのミューテックス確保回数を激増させる。
3.  **ミューテックスの競合が発生するのに十分なCPUコア数。** 1〜2コアのコンテナ環境で低負荷なら、誤差レベルの違いしかない。

私は16スレッドのRyzen環境で、リクエストごとに `Connection` を開くRust + `axum` のサービスを動かした際にこれに遭遇した。50並列で1行取得の軽量エンドポイントを叩いたところ、スループットは **5,622 req/s**。`perf record -g` で確認すると、CPUの約18%が `sqlite3_malloc` 起因の `__lll_lock_wake/wait` に消えていた。フラグを `0` にして再ビルドした結果、スループットは **30,737 req/s** まで跳ね上がり、futexのオーバーヘッドは一掃された。

<img class="uml-bg" loading="lazy" src="/img/hq/sqlite-default-memstatus-rusqlite-ja.svg" alt="SQLite内部でmallocを実行する2つのワーカースレッドが、同じグローバルmem0ミューテックスで停止している" title="1つのグローバルミューテックスがN個の並列リーダーを直列化する理由">

## Rustアプリでフラグを切り替える方法

通常通り `bundled` 機能を有効にして、cargoにSQLiteをコンパイルさせる設定にする。

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.39", features = ["bundled"] }
```

ただし、`Cargo.toml` にはこのフラグを切り替える機能（feature）はない。[rusqliteのREADME](https://github.com/rusqlite/rusqlite/blob/v0.39.0/README.md#notes-on-building-rusqlite-and-libsqlite3-sys)に記載されている公式の回避策は、`libsqlite3-sys` がコンパイル時に参照する環境変数 `LIBSQLITE3_FLAGS` を使うことだ。

一番スマートなやり方は、プロジェクトの `.cargo/config.toml` に設定を書き込んでしまうこと。これでワークスペース内の `cargo build` / `test` / `run` すべてに環境変数が適用される。

```toml
# .cargo/config.toml
[env]
LIBSQLITE3_FLAGS = "SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
```

このファイルを `Cargo.toml` と一緒にコミットしておこう。そうすれば、他の開発者やCIランナーも追加設定なしでこのフラグを継承できる。cargoは `cargo:rerun-if-env-changed=LIBSQLITE3_FLAGS` を出力するので、値を書き換えれば自動で `libsqlite3-sys` が再ビルドされる（`cargo clean` は不要だ）。

単発で実行するなら、ターミナルでエクスポートしてビルドすればいい。

```bash
export LIBSQLITE3_FLAGS="SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
cargo build --release
```

NixのdevshellやGitHub Actionsの `env:` ブロック、Dockerの `ENV` でも同様だ。READMEで保証されているフォーマットは「スペース区切りのトークン」で、`SQLITE_XYZ=value` か `-DSQLITE_XYZ` 形式で指定する。

実行時にコンパイルオプションをクエリして、反映されたか確認してみよう。

```rust
let flags: Vec<String> = conn
    .prepare("SELECT * FROM pragma_compile_options();")?
    .query_map([], |r| r.get(0))?
    .collect::<Result<_, _>>()?;
```

少しややこしいのが、デフォルトのrusqliteビルドでは `DEFAULT_MEMSTATUS` はリストに出てこない点だ。SQLiteの `pragma_compile_options()` は、「デフォルトから変更された値」のみを出力する。`=0` に設定すると、晴れて出力の中に `DEFAULT_MEMSTATUS=0` が現れるようになる。

## トレードオフ

`=0` に設定すると、`sqlite3_memory_used()` や `sqlite3_status()` がゼロを返すようになる。もしコード内でこれらに依存しているなら（組み込みのデバッグ用途以外で使われることは稀だが）、その部分は動かなくなる。

ロジックの正確性への影響はない。アロケーション自体は行われるし、解放もされる。ただ「集計」が止まるだけだ。そもそも `sqlite-jdbc` や Node、CPython などの標準的な構成ではすでに無効化されている設定なので、これを有効にすることは「特殊な設定にする」というより、「デファクトスタンダードに合わせる」という感覚に近い。

> アップストリームでの議論については、SQLiteフォーラムの [SQLITE_DEFAULT_MEMSTATUS](https://sqlite.org/forum/forumpost/021b434e7a) スレッドを参照。
 
