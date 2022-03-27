---
title: Zrównoleglanie skryptów powłoki
url: zrównoleglanie-skryptów-powłoki
id: 20
category:
- other: Inne
tags:
  - shell
author: Damian Terlecki
date: 2020-01-04T20:00:00
---

Kiedy uruchamianie twoje skrypty zajmują zbyt dużo czasu, pamiętaj, że bardzo często możesz je przyspieszyć, refaktorując poszczególne części kodu i wywołując je równolegle. Wyjątkowo, może się nawet okazać, że twoje zadanie jest [idealnie równoległe](https://en.wikipedia.org/wiki/Embarrassingly_parallel) i wzrost wydajności uruchamiania go na wielu rdzeniach procesora będzie niemal liniowy. W pozostałych przypadkach nadal możemy liczyć na znaczne przyspieszenie ograniczone jednak czasem wykonania części nierównoległej (synchronizacja/agregacja wyników). Obserwacja ta została opisana pod nazwą [Prawa Amdahla](https://pl.wikipedia.org/wiki/Prawo_Amdahla).

```
// T – całkowity czas potrzebny do wykonania zadania
// S – szeregowa część problemu
// T - S – współbieżna część pracy
// N – liczba procesorów
T = S + (T - S)
T(N) = S + (T(1) - S) / N
```

<img class="uml-bg" src="/img/hq/prawo-amdahla.svg" alt="Prawo Amdahla – Przyspieszenie" title="Prawo Amdahla – Przyspieszenie">


### Linux

W środowisku Linux uruchamianie skryptów równolegle sprowadza się do wywołania ich w tle (dodania `&` do polecenia) i ewentualnego [poczekania na zakończenie](http://man7.org/linux/man-pages/man2/waitid.2.html). Ponadto dobrą praktyką jest ograniczenie liczby procesów do [ilości procesorów](http://man7.org/linux/man-pages/man1/nproc.1.html), gdyż w typowych przypadkach nie uzyskamy większego zrównoleglenia, a jedynie wydłużymy czas wykonania poprzez nadmierny przydział zasobów i zmianę kontekstu.

```bash
PARALLELISM=$(nproc)
for file in ../app/src/main/assets/data/*
do
    ((i=i%PARALLELISM)); ((i++==0)) && wait
    ./generate_site_tree.sh ${file} &
done
wait
```

### Windows

W przypadku systemu Windows zalecam skorzystanie z opcji Linuxowej za pomocą dodatkowych narzędzi np. zainstalowanych wraz z Gitem (wybór opcjonalny) lub czegoś w rodzaju Cygwina. Jeśli jednak siły zewnętrzne zmusiły cię do tego, to możesz spróbować szczęścia z poniższym skryptem. Program uruchomi równolegle zadania, ograniczając liczbę procesów na podstawie własnego tytułu zadania *cmd.exe*. Do pozyskania liczby procesorów zainstalowanych na komputerze skorzystamy z wartości zmiennej środowiskowej [%NUMBER_OF_PROCESSORS%](http://environmentvariables.org/Number_Of_Processors).

```bash
@ECHO off
set PARALLELISM=%NUMBER_OF_PROCESSORS%
for /R %%f in (..\app\src\main\assets\data\*) do (
    START "my_parallelized_task" cmd.exe /c generate_site_tree.bat %%f
    call :wait
)

:wait
for /f %%i in ('tasklist /fi "windowtitle eq my_parallelized_task" ^| find /I /C "cmd.exe"') do set taskCount=%%i
if "%taskCount%"=="%PARALLELISM%" goto :wait
```
### Podsumowanie

Przyspieszanie wykonywania skryptów powłoki może być dosyć ciekawym ćwiczeniem. Oszczędność kilku minut na każdym wywołaniu może z czasem zsumować się do pokaźnych wartości. W celu zrównoleglenia skryptu, konieczna będzie refaktoryzacja części kodu na osobne skrypty, co może okazać się dosyć pozytywnym efektem, szczególnie jeśli zadanie jest dosyć pokaźne. Jest to również dobry sposób na poszerzenie wiedzy związanej z tworzeniem skryptów.