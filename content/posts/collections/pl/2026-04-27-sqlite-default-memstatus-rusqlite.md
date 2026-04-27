---
title: SQLITE_DEFAULT_MEMSTATUS – muteks w SQLite, o którego istnieniu w rusqlite nie miałeś pojęcia
url: sqlite-default-memstatus-rusqlite
id: 129
category:
  - databases: Bazy danych
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

Jeśli osadzasz SQLite w usłudze napisanej w Ruście za pomocą `rusqlite` v0.39.0 z włączoną funkcją `bundled`, biblioteka `libsqlite3-sys` kompiluje dołączony kod źródłowy `sqlite3.c` z aktywną flagą `SQLITE_DEFAULT_MEMSTATUS=1`. Chociaż rusqlite przekazuje listę flag `-DSQLITE_*` do procesu budowania C, nigdy nie nadpisuje tej konkretnej, więc domyślna wartość SQLite (wynosząca `1`) pozostaje w mocy.

To sprawia, że każda operacja `sqlite3_malloc` i `sqlite3_free` trafia za jeden, **globalny dla całego procesu muteks**.

Przy jednym wątku nigdy tego nie odczujesz. Jednak przy równoległych odczytach i modelu połączenia otwieranego na każde żądanie (per-request), może to drastycznie ograniczyć przepustowość. Rozwiązaniem jest jedna zmienna środowiskowa ustawiana podczas budowania.

## Co ta flaga właściwie robi

SQLite śledzi statystyki wykorzystania pamięci w całym procesie (`sqlite3_memory_used()`, `sqlite3_status()`). Aby te liczby były spójne między wątkami, każda alokacja i zwolnienie pamięci aktualizuje licznik pod osłoną muteksu. [Dokumentacja SQLite](https://sqlite.org/compile.html#default_memstatus) wymienia `SQLITE_DEFAULT_MEMSTATUS=0` wśród zalecanych opcji kompilacji pod kątem szybkości:

> To ustawienie powoduje wyłączenie interfejsów sqlite3_status(), które śledzą użycie pamięci. Pomaga to procedurom sqlite3_malloc() działać znacznie szybciej, a ponieważ SQLite używa sqlite3_malloc() wewnętrznie, pomaga to przyspieszyć działanie całej biblioteki.

Dokumentacja zachwala przyspieszenie, ale mechanizm, który za tym stoi, to usunięcie globalnego muteksu z każdej operacji alokacji i zwolnienia pamięci. Keith Medcalf [stwierdził to bez ogródek](https://sqlite.org/forum/forumpost/a4f343b221) na forum SQLite: włączenie MEMSTATUS ma „efekt uboczny w postaci owinięcia alokatorów pamięci w muteks (tj. tylko jeden wątek wykonania na raz może mieć dostęp do alokatora pamięci)”. Ustawienie `SQLITE_DEFAULT_MEMSTATUS=0` na etapie kompilacji wyłącza licznik i muteks. Wywołania malloc/free na poziomie C idą bezpośrednio dalej.

## Kto buduje z `=0`, a kto nie

Ciekawa asymetria występuje między różnymi sterownikami. SQLite to to samo drzewo źródeł C, ale każdy ekosystem dostarcza własny build:

| Projekt | SQLITE_DEFAULT_MEMSTATUS | Gdzie ustawiono |
| :--- | :--- | :--- |
| **rusqlite (bundled)** | `=1` (domyślne) | brak nadpisania |
| **sqlite-jdbc** | `=0` | Makefile.common |
| **node:sqlite (Node)** | `=0` | PR #56541 (Jan 2025) |
| **CPython sqlite3** | `=0` | setup_helpers.py |

Trzy z czterech głównych projektów wykorzystujących osadzone SQLite jawnie wyłączają ten muteks. Rust tego nie robi.

## Kiedy domyślne ustawienie faktycznie boli

Muszą zostać spełnione trzy warunki jednocześnie:

1.  **Wiele wątków jednocześnie wewnątrz kodu C SQLite.** Na przykład usługa webowa z pulą wątków (worker pool), która odwołuje się do SQLite pod obciążeniem. Kod jednowątkowy nigdy nie zauważy tego muteksu.
2.  **Cykl życia połączenia "per-żądanie"** lub jakikolwiek wzorzec z dużą rotacją alokacji – parsowanie, otwieranie, zamykanie. Każde `sqlite3_open` parsuje `sqlite_master`, alokuje struktury schematu, otwiera B-drzewo. Każde zamknięcie to zwalnianie tych struktur. Wiele małych alokacji na żądanie = wiele zajęć muteksu na żądanie.
3.  **Wystarczająca liczba rdzeni, aby doszło do rywalizacji o muteks.** W kontenerze z 1-2 vCPU przy niskiej współbieżności różnica będzie jedynie błędem pomiarowym.

Trafiłem na ten problem na 16-wątkowym procesorze Ryzen w usłudze Rust + `axum`, która otwierała nowe połączenie (`Connection`) na każde żądanie. Przy 50 równoległych użytkownikach uderzających w endpoint zwracający pojedynczy wiersz, przepustowość wynosiła **5 622 req/s**, a profilowanie `perf record -g` pokazało ok. 18% czasu procesora w `__lll_lock_wake/wait` wywodzącym się z `sqlite3_malloc`. Po zmianie flagi: **30 737 req/s**, a ślad futeksu zniknął.

<img class="uml-bg" loading="lazy" src="/img/hq/sqlite-default-memstatus-rusqlite.svg" alt="Dwa wątki robocze, każdy uruchamiający malloc wewnątrz SQLite, oba zatrzymane na tym samym globalnym muteksie mem0" title="Dlaczego jeden globalny muteks szereguje N równoległych czytelników">

## Jak to zmienić w aplikacji Rust

Zależność od rusqlite deklarujesz w zwykły sposób – z włączoną funkcją `bundled`, dzięki czemu cargo skompiluje SQLite za Ciebie:

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.39", features = ["bundled"] }
```

W `Cargo.toml` nie ma funkcji (feature), która przełączałaby `SQLITE_DEFAULT_MEMSTATUS`. Wspieraną "furtką", opisaną w [README rusqlite](https://github.com/rusqlite/rusqlite/blob/v0.39.0/README.md#notes-on-building-rusqlite-and-libsqlite3-sys), jest zmienna środowiskowa `LIBSQLITE3_FLAGS`, którą `libsqlite3-sys` odczytuje podczas kompilacji. Najczystszym miejscem na jej zdefiniowanie jest plik `.cargo/config.toml`, który ustawia zmienne środowiskowe dla każdego `cargo build` / `cargo test` / `cargo run` w danej przestrzeni roboczej:

```toml
# .cargo/config.toml
[env]
LIBSQLITE3_FLAGS = "SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
```

Zatwierdź ten plik w repozytorium obok `Cargo.toml`. Każdy programista i każda instancja CI budująca Twoją aplikację odziedziczy tę flagę bez dodatkowej konfiguracji. Cargo emituje `cargo:rerun-if-env-changed=LIBSQLITE3_FLAGS`, więc edycja tej wartości automatycznie przebuduje `libsqlite3-sys` (nie trzeba robić `cargo clean`).

Doraźne wywołania działają tak samo – eksportujesz i budujesz:

```bash
export LIBSQLITE3_FLAGS="SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_DISABLE_PAGECACHE_OVERFLOW_STATS"
cargo build --release
```

To samo dotyczy konfiguracji w devshellu Nix (`flake.nix devShells.default`), bloku `env:` w GitHub Actions czy linii `ENV` w Dockerze. Format gwarantowany przez README: tokeny oddzielone spacjami, z których każdy jest w formie `SQLITE_XYZ=wartość`, `-DSQLITE_XYZ` lub `-USQLITE_XYZ`.

Możesz zweryfikować, czy flaga zadziałała, odpytując o opcje kompilacji w czasie wykonywania programu:

```rust
let flags: Vec<String> = conn
    .prepare("SELECT * FROM pragma_compile_options();")?
    .query_map([], |r| r.get(0))?
    .collect::<Result<_, _>>()?;
```

Wbrew intuicji, domyślny build rusqlite w ogóle NIE zawiera `DEFAULT_MEMSTATUS` na liście – funkcja `pragma_compile_options()` w SQLite wypisuje tylko te opcje, których wartość różni się od domyślnej u źródła. Dopiero po zmianie na `=0`, wpis `DEFAULT_MEMSTATUS=0` pojawi się w wyniku (wraz z wszystkim innym, co ustawisz przez `LIBSQLITE3_FLAGS`).

## Kompromisy

Ustawienie `=0` sprawia, że `sqlite3_memory_used()` i `sqlite3_status()` zwracają zero. Jeśli Twój kod zależy od tych funkcji (mało która aplikacja ich używa; to głównie API do introspekcji przy debugowaniu systemów wbudowanych), ta flaga je "psuje".

Nie ma to jednak żadnego wpływu na poprawność działania bazy. Alokacje i zwolnienia pamięci nadal się odbywają – znika jedynie licznik statystyk. Z tą flagą domyślnie dostarczane są sterowniki `sqlite-jdbc`, Node i standardowa biblioteka `sqlite3` w Pythonie – zmieniając ją, zbliżasz się do najpopularniejszych ustawień produkcyjnych, a nie od nich oddalasz.

> Zobacz wątek na forum SQLite dotyczący [SQLITE_DEFAULT_MEMSTATUS](https://sqlite.org/forum/forumpost/021b434e7a), aby poznać dyskusję u źródła.