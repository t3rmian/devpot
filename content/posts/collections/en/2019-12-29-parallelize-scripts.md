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

When your shell scripts are taking a considerable amount of time to run remember, that in the most typical cases you can still speed them up by refactoring your code into parts that can be run in parallel. In some rare cases you might find out that your task is [embarrasingly parallel](https://en.wikipedia.org/wiki/Embarrassingly_parallel) and the performance increase of running it on multiple CPU cores will be magnificent. If not, most often you will still gain a significant speed up limited by the time of executing the non-parallelizable part (synchronization/aggregating results) what is simplified by [Amdahl's Law].

```
// T - total time needed to execute the task
// S - the serial part of the problem
// T - S - concurrent part of the work
// N - number of processors
T = S + (T - S)
T(N) = S + (T(1) - S) / N
```

#### Linux

On the Linux environment running scripts in parallel comes to executing them in the background and [waiting for finish](http://man7.org/linux/man-pages/man2/waitid.2.html). Additionally the best practice is to limit the parallelism to the [number of processors](http://man7.org/linux/man-pages/man1/nproc.1.html) as we won't gain anything above that value, only cause an additional overhead. 

```bash
PARALLELISM=$(nproc)
for file in ../app/src/main/assets/data/*
do
    ((i=i%PARALLELISM)); ((i++==0)) && wait
    ./generate_site_tree.sh ${file} &
done
wait
```

#### Windows
