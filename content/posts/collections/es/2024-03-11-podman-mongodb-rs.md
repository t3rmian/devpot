---
title: Particularidades de Replica Set de MongoDB con Podman (Compose)
url: mongodb-replica-set-caveats-with-podman-compose
id: 126
category:
  - databases: Bases de datos
tags:
  - mongodb
  - docker
  - podman
author: Damian Terlecki
date: 2024-03-11T20:00:00
---

Es fácil encontrar configuraciones funcionales de docker/docker-compose para montar un replica set de MongoDB. Sin embargo, ninguna me funcionó cuando quise conectar desde una máquina Linux usando podman-compose. Para ilustrar el problema, un replica set suele [iniciarse](https://www.mongodb.com/docs/v7.0/reference/method/rs.initiate/) desde el shell tras conectar a un `mongod` con `--replSet` y `--bind_ip` (opcionalmente `--port`):

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

## Un hostname para gobernarlos a todos

Los hosts definidos deben ser accesibles tanto desde cada nodo como desde el cliente. A menudo verás [el uso de `host.docker.internal`](https://medium.com/workleap/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need-2f0b74dd8384) en vez de `mongodbN.example.net`. En una red bridge por defecto, se mapea a `host-gateway` usando `extra_hosts`. En Podman, el equivalente es `host.containers.internal`, que debería funcionar sin definir hosts extra.

> **Nota:** si ves 'invalid IP address in add-host: "host-gateway"', puede que tengas una versión antigua de docker/podman en Linux. En casos básicos puedes cambiarlo por `172.17.0.1`, pero puede variar si usas varias redes. Consulta [este hilo de SO](https://stackoverflow.com/questions/48546124/what-is-the-linux-equivalent-of-host-docker-internal) para soluciones más completas.

También puedes usar el nombre del servicio o configurar `container_name` y `hostname` para montar el RS con nombres personalizados.

## Puertos

El segundo detalle es la configuración de puertos. Un solo bridge implica que cada nodo debe tener un puerto distinto (por ejemplo, `27017`, `27018`, `27019`) y debe coincidir en la definición de miembros, el config de `mongod` y los bindings de puertos del host.

Si no coinciden:
- un nodo puede desaparecer de la vista del cliente (la dirección canónica no coincide);
- problemas para acceder a todos los nodos desde el host;
- errores al iniciar el RS al no encontrarse en la config.

## UnknownHostException

El tercer detalle es que `host.docker.internal` no se resuelve en hosts Linux y requiere añadir una entrada en `/etc/hosts` apuntando a `127.0.0.1`. Sin embargo, con Podman, [el `/etc/hosts` del host se copia en los contenedores](https://github.com/containers/podman/issues/11835), lo que causa errores al iniciar el RS.

<figure class="flex">
  <img src="/img/hq/mongo-rs-podman-hosts-copy.png" alt="Captura de 'host.docker.internal' duplicado desde el host en el '/etc/hosts' del contenedor." title="Duplicado de 'host.docker.internal' desde el host en el '/etc/hosts' del contenedor">
  <img src="/img/hq/mongo-rs-podman-host-copy-repl-error.png" alt="Error de replicación por 'host.docker.internal' duplicado en '/etc/hosts' resolviendo a la IP incorrecta." title="Error de replicación por 'host.docker.internal' duplicado en '/etc/hosts' resolviendo a la IP incorrecta">
</figure>

La opción `--no-hosts` está disponible desde Podman 4.0, pero entra en conflicto con `host.containers.internal`/`host.docker.internal`. Una solución cruda es actualizar el `/etc/hosts` del contenedor antes de arrancar `mongod`. Pero es mejor desactivar este comportamiento globalmente con la propiedad (Podman 4.1) en [`$HOME/.config/containers/containers.conf`](https://github.com/containers/common/blob/v0.58/docs/containers.conf.5.md#description):

```shell
[containers]
base_hosts_file="none"
```

## Resumen

Si tienes problemas montando un replica set de MongoDB dockerizado para desarrollo, especialmente en Linux o usando Podman, revisa:
- El replica set debe configurarse con hostnames y puertos accesibles desde cada nodo y desde el cliente (host);
- Usa puertos distintos para cada nodo para que la vista del RS coincida con el binding en la red bridge;
- Usa `host.docker.internal` (puede requerir `extra_hosts`)/`host.containers.internal` (Podman) en la propiedad host de los miembros;
- Alternativamente, usa `container_name` y `hostname` si necesitas hostnames personalizados;
- Si tienes errores de hostname no accesible en el host, añade los nombres al `/etc/hosts` del host;
- Desactiva la copia de `/etc/hosts` del host con el archivo `containers.conf` en Podman;
- Como último recurso en Linux, usa `network_mode: host` y conecta al RS en localhost directamente.
