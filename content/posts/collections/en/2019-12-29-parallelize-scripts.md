---
title: Parallelize shell scripts
url: parallelize-shell-scripts
id: 20
tags:
  - scripts
  - shell
author: Damian Terlecki
date: 2019-12-29T20:00:00
---

When your shell scripts are taking a considerable amount of time to run remember that in the most typical cases you can still speed them up by refactoring your code into parts that can be run in parallel. In some rare situations, you might find out that your task is [embarrasingly parallel](https://en.wikipedia.org/wiki/Embarrassingly_parallel) and the performance increase of running it on multiple CPU cores will be magnificent. If not, most often you will still gain a significant speed up limited by the time of executing the non-parallelizable part (synchronization/aggregating results) what is simplified by [Amdahl's Law](https://en.wikipedia.org/wiki/Amdahl%27s_law).

```
// T – total time needed to execute the task
// S – the serial part of the problem
// T - S – concurrent part of the work
// N – number of processors
T = S + (T - S)
T(N) = S + (T(1) - S) / N
```

<img style="background: white" src="/img/hq/amadahls-law.svg" alt="Amdahl's Law – Speedup" title="Amdahl's Law – Speedup">


### Linux

On the Linux environment running scripts in parallel comes to executing them in the background (appending `&`) and eventually [waiting for finish](http://man7.org/linux/man-pages/man2/waitid.2.html). Additionally, the best practice is to limit the parallelism to the [number of processors](http://man7.org/linux/man-pages/man1/nproc.1.html) as we won't gain anything above that value, only cause additional overhead. 

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

In the case of Windows, I recommend using the Linux version through additional tools installed with Git or through something like Cygwin. If your options are really limited, try out the following batch snippet. This program will run the tasks in parallel limiting the number of custom-named *cmd.exe* processes to the [%NUMBER_OF_PROCESSORS%](http://environmentvariables.org/Number_Of_Processors) environment variable.

```shell
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
### Summary

Parallelizing your scripts can be a quite fun exercise. Saving a few minutes on each execution can sum up over time to some incredible numbers. You will have to refactor some of your code into separate scripts, which is a good thing if your task is oversized. It is also a nice way to get more familiar with scripting in your favorite environment.
