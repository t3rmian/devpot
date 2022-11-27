---
title: Uprawnienia do woluminów dockerowych
url: uprawnienia-do-woluminów-dockerowych
id: 100
category:
  - other: Inne
tags:
  - docker
  - podman
  - oracle
  - linux
author: Damian Terlecki
date: 2022-11-27T20:00:00
---

Jedną z podstawowych funkcjonalności kontenerów dockerowych jest możliwość podpinania współdzielonych woluminów pod konkretne katalogi
wewnątrz konteneru. Opcja ta pozwala na współdzielenie plików między hostem i kontenerem, a także pomiędzy wybranymi kontenerami.
Dzięki niej dane przetrwają nie tylko restart kontenera (standardowo), ale również jego usunięcie.

Korzystanie z woluminów opisane jest dosyć dobrze w [dokumentacji Dockera](https://docs.docker.com/storage/volumes/).
To o czym warto wiedzieć to kwestie uprawnień, które mogą wymagać przygotowania wolumenu pod konkretny kontener, a dodatkowo różnią się w zależności od systemu operacyjnego hosta.

## Uprawnienia do nienazwanego woluminu na przykładzie OracleDB XE

Weźmy na tapet ogólnodostępny obraz bazy OracleDB Express Edition (edycja bezpłatna) `docker.io/gvenzl/oracle-xe:21.3.0-slim`.
Cechą szczególną bazy i obrazu jest użytkownik systemowy `oracle`, z poziomu którego inicjalizowana i startowana jest baza danych.
W tej wersji bazy, pliki z danymi zapisywane są w `/opt/oracle/oradata`. Stworzenie kontenera z podpiętym woluminem może więc wyglądać tak:
```
docker run -e ORACLE_PASSWORD=123 -p 1521:1521 -v C:\Users\t3rmian\data:/opt/oracle/oradata --name myoratest gvenzl/oracle-xe:21-slim
```
Po uruchomieniu kontenera nastąpi proces inicjalizacji bazy danych (XE/XEPDB1).
W zależności, czy wolumin pochodzi z systemu Windows, czy Linux (np. WSL 2), możemy spodziewać się poprawnej inicjalizacji bazy bądź nie.
- Linux:

<img src="/img/hq/oradata-volume-linux.png" alt="
CONTAINER: starting up...
CONTAINER: first database startup, initializing...
CONTAINER: uncompressing database data files, please wait...
checkdir error:  cannot create /opt/oracle/oradata/XE
Permission denied
unable to process XE/." title="Inicjalizacja OracleDB XE w kontenerze (host Linux)">
- Windows:

<img src="/img/hq/oradata-volume-windows.png" alt="
CONTAINER: starting up...
CONTAINER: first database startup, initializing...
CONTAINER: uncompressing database data files, please wait...
...
#########################
DATABASE IS READY TO USE!
#########################" title="Inicjalizacja OracleDB XE w kontenerze (host Windows)">

Sprawdzając uprawnienia do katalogu z poziomu kontenera (usuwamy kontener i dodajemy parametr `-it --rm --entrypoint /bin/sh`), szybko potwierdzimy, że użytkownik
nie ma dostępu r/w do katalogu:
- Linux:
  ```
  sh-4.4$ ls -alth /opt/oracle/oradata && id
  total 8.0K
  drwxr-xr-x  2 root   root     4.0K Nov 27 11:29 .
  drwxr-xr-x 11 oracle oinstall 4.0K Oct 30 04:06 ..
  uid=54321(oracle) gid=54321(oinstall) groups=54321(oinstall),54322(dba),54323(oper),54324(backupdba),54325(dgdba),54326(kmdba),54330(racdba)
  ```
- Windows:
  ```
  sh-4.4$ ls -alth /opt/oracle/oradata && id
  total 8.0K
  drwxr-xr-x 1 oracle oinstall  512 Nov 27 11:41 dbconfig
  drwxrwxrwx 1 root   root      512 Nov 27 11:41 .
  drwxr-xr-x 1 oracle oinstall 4.0K Nov 27 11:41 ..
  drwxr-x--- 1 oracle oinstall  512 Oct 30 04:05 XE
  uid=54321(oracle) gid=54321(oinstall) groups=54321(oinstall),54322(dba),54323(oper),54324(backupdba),54325(dgdba),54326(kmdba),54330(racdba)
  ```

Zachowanie widoczne dla systemu Windows jest tu [udokumentowanym](https://docs.docker.com/desktop/troubleshoot/topics/#volumes) odstępstwem od standardu.
Należy o tym pamiętać, jeśli przygotowujemy obraz wraz z instrukcją uruchomienia na systemie Windows, a będzie on używany w innych systemach.

## Inicjalizacja woluminu z poziomu kontenera (wolumin nazwany)

Rozwiązanie problemu z uprawnieniami jest proste i sprowadza się do [inicjalizacji woluminu przez kontener](https://docs.docker.com/storage/volumes/#populate-a-volume-using-a-container).
Do tego użyjemy nazwanego woluminu `oradata`:
```
# docker rm myoratest
docker run -d -e ORACLE_PASSWORD=123 -p 1521:1521 -v oradata:/opt/oracle/oradata --name myoratest gvenzl/oracle-xe:21-slim
docker exec -it myoratest ls -alth /opt/oracle/oradata
# total 16K
# drwxr-x---  4 oracle oinstall 4.0K Nov 27 13:21 .
```

Ścieżkę do woluminu utworzonego na hoście odnajdziesz, odczytując atrybut `Mountpoint` woluminu:
```
docker volume inspect oradata
[
    {
        "CreatedAt": "2022-11-27T13:33:12Z",
        "Driver": "local",
        "Labels": null,
        "Mountpoint": "/var/lib/docker/volumes/oradata/_data",
        "Name": "oradata",
        "Options": null,
        "Scope": "local"
    }
]
```

Jeśli dane potrzebujemy zapisać w niestandardowym miejscu, np. `/home/t3rmian/oradata`, możemy to zrobić, definiując nazwany wolumin przed utworzeniem kontenera:
```
docker volume create --driver local \
    --opt type=none \
    --opt device=/home/t3rmian/oradata \
    --opt o=bind \
    oradata
```

# Inicjalizacja woluminu z poziomu hosta (wolumin nienazwany)

Często wolumin będziemy chcieli jednak zainicjalizować plikami z poziomu hosta.
Jak wspomniałem wcześniej na systemie Windows/MacOS taki dostęp nie jest ograniczony.

Na Linuksie możemy spróbować uruchomić kontener z uprawnieniami użytkownika lokalnego `-u $(id -u ${USER}):$(id -g ${USER})`.
W przypadku powyższego obrazu, rozwiązanie jednak nie zadziała. Użytkownik `oracle` jest dosyć ściśle powiązany z inicjalizacją bazy.
Potrzebować będziemy pewnych modyfikacji w obrazie.

Polecam artykuł ["Running Docker Containers as Current Host User"](https://jtreminio.com/blog/running-docker-containers-as-current-host-user/) w celu dokładniejszego zapoznania się z tym oraz innymi podejściami do problemu.

> W tym miejscu narzędzie `podman` (architektura fork-exec) jako zamiennik narzędzia `docker` (architektura klient-server) stara się usprawnić koncepcję przestrzeni nazw użytkowników, dzięki której odbywa się dostęp do zasobów hosta. Polecenie [`podman unshare`](https://docs.podman.io/en/latest/markdown/podman-unshare.1.html) pozwala szybko zweryfikować i rozwiązać napotkane problemy z nieuprzywilejowanym dostępem.   