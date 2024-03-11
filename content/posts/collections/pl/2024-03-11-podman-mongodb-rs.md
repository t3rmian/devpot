---
title: Wskazówki konfiguracyjne replikacji MongoDB przy użyciu Podmana (Compose)
url: mongodb-replika-wskazówki-podman-compose
id: 126
category:
  - databases: Databases
tags:
  - mongodb
  - docker
  - podman
author: Damian Terlecki
date: 2024-03-11T20:00:00
---

W internecie łatwo znajdziesz działające konfiguracje uruchomieniowe MongoDB w trybie replikacji przy użyciu Dockera/Docker Compose.
Niestety z kilku powodów żadna z nich nie chciała mi zadziałać przy wykorzystaniu Podman Compose na systemie z Linuxem.
Aby zrozumieć problem, powiedzmy, że replikacja jest zwykle [inicjowana](https://www.mongodb.com/docs/v7.0/reference/method/rs.initiate/) przez powłokę (`mongosh`) po połączeniu się
z instancją `mongod` (działającą z parametrami `--replSet`, `--bind_ip` i opcjonalnie `--port`):

```js
rs.initiate(
   {
      _id: "myReplSet",
      version: 1,
      members: [
         { _id: 0, host : "mongodb0.example.net:27017" },
         { _id: 1, host : "mongodb1.example.net:27017" },
         { _id: 2, host : "mongodb2.example.net:27017" }
      ]
   }
)
```

## Wybór nazwy hosta poszczególnych członków zbioru replikacji

Zacznijmy od tego, że adresy zdefiniowane w konfiguracji muszą być dostępne zarówno z poziomu każdego członka zbioru replikacji, jak i z poziomu maszyny klienta (hosta).
Częstym rozwiązaniem jest [użycie `host.docker.internal`](https://medium.com/workleap/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need-2f0b74dd8384)
zamiast w miejscu `mongodbN.example.net`. W domyślnej konfiguracji sieci typu *bridge* jest ona mapowana na `host-gateway`
np. przy użyciu opcji `extra_hosts` na poziomie serwisu w konfiguracji Docker Compose. Jest to adres hosta widoczny z poziomu kontenera.
Podman ma tu swój odpowiednik `host.containers.internal`, który działa bez definiowania dodatkowego hosta.

> **Uwaga:** błąd 'invalid IP address in add-host: "host-gateway"' może oznaczać, że korzystasz ze starej wersji silnika
> dockera/podmana w systemie Linux. W najbardziej podstawowych przypadkach możesz podstawić w tym miejscu wartość `172.17.0.1`, ale może
> się ona różnić w przypadku pracy z wieloma sieciami. Sprawdź [ten wątek SO](https://stackoverflow.com/questions/48546124/what-is-the-linux-equivalent-of-host-docker-internal),
> aby dobrać lepsze, ale bardziej złożone rozwiązania.

Alternatywnie możesz użyć nazwy usługi lub na poziomie usługi przydzielić nazwę kontenera `container_name` i hosta `hostname`, aby skonfigurować replikację z niestandardowymi nazwami hostów.

## Wybór portów

Drugie zastrzeżenie dotyczy konfiguracji portu. Ta sama nazwa hosta lub mapowanie na to samo IP oznacza, że porty dla każdego członka muszą się różnić (np. `27017`, `27018`, `27019`) i
odpowiadać definicji replikacji, konfiguracji `mongod`, a także powiązaniom portów między hostem a kontenerami.

Niedopasowania mogą prowadzić do:
- usunięcie węzła z klienckiego widoku klastra ("canonical address of the node does not match server address, removing node from client view of cluster");
- problemy z dostępem do wszystkich węzłów z poziomu hosta;
- błędy inicjacji replikacji podczas próby odnalezienia się członka w konfiguracji replset ("error trying to find self in the replset config").

## UnknownHostException

Trzecim problemem jest to, że nazwa hosta `host.docker.internal` jest standardowo nieosiągalna na hostach z systemem Linux i
wymaga dodania wpisu do `/etc/hosts`. Najczęściej mapowany jest on na domyślny adres pętli zwrotnej `127.0.0.1`. Dodatkowo w
przypadku
Podmana [adresy z `/etc/hosts` hosta przenoszone są do `/etc/hosts` kontenerów](https://github.com/containers/podman/issues/11835),
powodując błędy inicjacji replikacji.

<figure class="flex">
  <img src="/img/hq/mongo-rs-podman-hosts-copy.png" alt="Zrzut ekranu przedstawiający zduplikowany wpis 'host.docker.internal' w '/etc/hosts' kontenera pochodzący zarówno z hosta jak i z kontenera." title="Zduplikowany wpis 'host.docker.internal' pochodzący z hosta komputera w pliku '/etc/hosts' kontenera">
  <img src="/img/hq/mongo-rs-podman-host-copy-repl-error.png" alt="Zrzut ekranu przedstawiający błąd replikacji przy zduplikowanym wpisie 'host.docker.internal' w pliku '/etc/hosts' powodowany połączeniem z niewłaściwym adresem IP." title="Błąd replikacji spowodowany zduplikowanym wpisem 'host.docker.internal' w pliku '/etc/hosts' prowadzącym do połączenia z niewłaściwym adresem IP">
</figure>

Wykorzystanie niedawno dodanej opcji `--no-hosts` (Podman 4.0), koliduje niestety z `host.containers.internal`/`host.docker.internal`.
W przypadku starszych wersji prymitywnym rozwiązaniem jest modyfikacja pliku `/etc/hosts` kontenera tuż przed uruchomieniem instancji `mongod`.
Znacznie lepszym rozwiązaniem jest wyłączenie tego zachowania globalnie,
poprzez nieco nowszą (Podman 4.1) opcję konfiguracyjną, w pliku
[`$HOME/.config/containers/containers.conf`](https://github.com/containers/common/blob/v0.58/docs/containers.conf.5.md#description):

```shell
[containers]
base_hosts_file="none"
```

## Podsumowanie

Jeśli napotkasz problemy z konfiguracją replikacji MongoDB na potrzeby dewelopmentu bądź testowania, w systemie Linux lub przy użyciu Podmana,
zwróć uwagę na następujące elementy:
- Zestawy replik powinny być skonfigurowane z nazwami hostów i kombinacjami portów osiągalnymi z każdego węzła, jak również z poziomu
  klienta (np. hosta).
- Użyj odrębnych portów dla każdego węzła, tak aby widok RS odpowiadał również powiązaniom portów pomiędzy kontenerami a hostem.
- Użyj nazwy hosta `host.docker.internal` (może wymagać `extra_hosts`)/`host.containers.internal` (Podman) przy konfiguracji adresów członków.
- Alternatywnie, zdefiniuj `container_name` i `hostname` na poziomie usługi, jeśli chcesz skonfigurować replikację z niestandardowymi nazwami hostów.
- W przypadku błędu nieosiągalnej nazwy adresu członka z poziomu hosta, dodaj mapowanie na adres IP do pliku `/etc/hosts`.
- Wyłącz kopiowanie `/etc/hosts` z komputera hosta poprzez plik `containers.conf`, jeśli korzystasz z Podmana.
- Alternatywnie Linux pozwala uruchomienie serwisu w tej samej sieci za pomocą właściwości `network_mode: host` a tym samym uproszczoną konfigurację replikacji przy użyciu localhosta.