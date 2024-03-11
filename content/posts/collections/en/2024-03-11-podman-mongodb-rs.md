---
title: MongoDB Replica Set caveats with Podman (Compose)
url: mongodb-replica-set-caveats-with-podman-compose
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

You may easily find working docker/docker-compose configurations for setting up a MongoDB replica set on the internet.
Somehow, none worked when I needed to set up a connection from a Linux host machine with podman-compose.
To outline the problem let's say that, a replica set is usually [initiated](https://www.mongodb.com/docs/v7.0/reference/method/rs.initiate/) through a shell after connecting to a `mongod` instance running with `--replSet` and `--bind_ip`
(optionally `--port`):

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

## One hostname to rule them all

The host members defined in the configuration must be both accessible from each node and from the client side.
Often, [you will find `host.docker.internal`](https://medium.com/workleap/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need-2f0b74dd8384)
being used in place of `mongodbN.example.net`.
In a default bridged network, it is mapped to the `host-gateway` of the docker network using the service `extra_hosts` property.
When using Podman, there's an equivalent `host.containers.internal` that should work without defining the extra hosts.

> **Note:** if you end up with an 'invalid IP address in add-host: "host-gateway"', you may be running old version of a docker
> engine/podman on the Linux. In the most basic cases, you can swap it with `172.17.0.1`, but it may differ when running with
> multiple networks.
> Check [this SO thread](https://stackoverflow.com/questions/48546124/what-is-the-linux-equivalent-of-host-docker-internal)
> to find out better but more complex solutions.

Alternatively, you can use service name or configure service `container_name` and `hostname` to set up an RS with custom hostnames.

## Port bindings

The second caveat is the port configuration. A single bridge means the ports for each node must differ (e.g., `27017`, `27018`, `27019`) and match
the members' definition, the `mongod`
config, and the host port bindings.

Mismatches may lead to:
- removal of a node from the client view of the cluster (canonical address of the node does not match server address);
- problems accessing all nodes from the host machine;
- RS initiation errors trying to find self in the replset config.

## UnknownHostException

The third caveat is that `host.docker.internal` is non-resolvable on Linux hosts and requires adding an entry
to `/etc/hosts` that maps to the default loopback
address `127.0.0.1`. However, with
Podman, [host `/etc/hosts` are included in containers `/etc/hosts`](https://github.com/containers/podman/issues/11835),
causing RS initiation errors.

<figure class="flex">
  <img src="/img/hq/mongo-rs-podman-hosts-copy.png" alt="Screenshot of 'host.docker.internal' entry duplicated from the machine host in the container's '/etc/hosts'." title="Duplicated 'host.docker.internal' entry from the machine host in the container's '/etc/hosts'">
  <img src="/img/hq/mongo-rs-podman-host-copy-repl-error.png" alt="Screenshot of a replication error on duplicated 'host.docker.internal' in '/etc/hosts' resolving to the wrong IP." title="Replication error due to a duplicated 'host.docker.internal' in '/etc/hosts' resolving to the wrong IP">
</figure>

The `--no-hosts` option has been made available recently (Podman 4.0), but it conflicts with `host.containers.internal`/`host.docker.internal`.
A working crude solution is to update container's `/etc/hosts` before `mongod` startup.
However, it's much better to disable this behavior globally
also through the latest (Podman 4.1) config property in
[`$HOME/.config/containers/containers.conf`](https://github.com/containers/common/blob/v0.58/docs/containers.conf.5.md#description):

```shell
[containers]
base_hosts_file="none"
```

## Summary

If you encounter problems setting up dockerized MongoDB replica set for development, especially on Linux or using Podman, review the
following:
- Replica sets should be configured with hostnames and port combinations reachable from each node as well as the
  client (e.g., host machine);
- Use distinct ports for each node so that the RS view matches port binding on a bridged network;
- Use `host.docker.internal` (may require `extra_hosts`)/`host.containers.internal` (Podman) for the members' host
  property;
- Alternatively, use service `container_name` and `hostname` if you need to set up an RS with custom hostnames;
- In case of unreachable hostname error on the host machine, add RS host names to the host's `/etc/hosts`;
- Disable `/etc/hosts` copy from the host machine through the `containers.conf` file for Podman;
- As a last resort on Linus, use service property `network_mode: host` and connect to the RS on the localhost
  out-of-the-box.