---
title: Docker volume permissions
url: docker-volume-permissions
id: 100
category:
  - other: Other
tags:
  - docker
  - podman
  - oracle
  - linux
author: Damian Terlecki
date: 2022-11-27T20:00:00
---

One of the basic Docker features is the ability to mount shared volumes pointing to specific directories
inside a container. This option enables file sharing between the host and the container, as well as between the selected containers.
Your data will also survive the container removal. Without it, you're only safe with a container restart.

The use of volumes is described quite well in the [Docker documentation](https://docs.docker.com/storage/volumes/).
What is worth noting is the permission handling between the host and the container, which additionally varies between the host operating systems.

## Permissions to an unnamed volume using OracleDB XE

Let's take the OracleDB Express Edition (free edition) image `docker.io/gvenzl/oracle-xe:21.3.0-slim` as an example.
A notable characteristic of this database is the `oracle` system user, from which the database is initialized and started.
In this version of the database, data files are stored in the `/opt/oracle/oradata` directory.
You might run a container with a nameless volume mounted under this directory:

```
docker run -e ORACLE_PASSWORD=123 -p 1521:1521 -v C:\Users\t3rmian\data:/opt/oracle/oradata --name myoratest gvenzl/oracle-xe:21-slim
```

After starting the container, the database initialization process (XE/XEPDB1) will start.
Depending on whether the volume is mounted from Windows or Linux (e.g. WSL 2), you may end up with an initialization failure.
- Linux:

<img src="/img/hq/oradata-volume-linux.png" alt="
CONTAINER: starting up...
CONTAINER: first database startup, initializing...
CONTAINER: uncompressing database data files, please wait...
checkdir error:  cannot create /opt/oracle/oradata/XE
Permission denied
unable to process XE/." title="OracleDB XE initialization in the container (Linux host)">
- Windows:

<img src="/img/hq/oradata-volume-windows.png" alt="
CONTAINER: starting up...
CONTAINER: first database startup, initializing...
CONTAINER: uncompressing database data files, please wait...
...
#########################
DATABASE IS READY TO USE!
#########################" title="OracleDB XE initialization in the container (Windows host)">

Let's check the directory permissions from the inside of the container. Remove the container and add the `-it --rm --entrypoint /bin/sh` parameter to the run command.
You can quickly confirm that the user has no r/w access to the directory:

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

The behavior on Windows is a [documented](https://docs.docker.com/desktop/troubleshoot/topics/#volumes) deviation from the standard here.
Keep this in mind if you're preparing an image/manual on a Windows/macOS and expect it to be also run on Linux.

## Volume pre-population from the container (named volume)

The solution to the permissions issue is simple and comes down to [populating the volume using a container](https://docs.docker.com/storage/volumes/#populate-a-volume-using-a-container).
For this we will use a newly-named volume `oradata`:

```
# docker rm myoratest
docker run -d -e ORACLE_PASSWORD=123 -p 1521:1521 -v oradata:/opt/oracle/oradata --name myoratest gvenzl/oracle-xe:21-slim
docker exec -it myoratest ls -alth /opt/oracle/oradata
# total 16K
# drwxr-x---  4 oracle oinstall 4.0K Nov 27 13:21 .
```

Now the owner of the *oradata* is the *oracle* user.
The path to the volume created by the Docker on the host can be inspected by checking the `Mountpoint` attribute of the volume:
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

If you need to store the data in a non-standard location, e.g. `/home/t3rmian/oradata`, you can now do so by explicitly creating a named volume before the container creation:
```
docker volume create --driver local \
    --opt type=none \
    --opt device=/home/t3rmian/oradata \
    --opt o=bind \
    oradata
```

# Volume pre-population from the host (nameless volume)

Othertimes, we will want to initialize the volume with files from the host.
As I mentioned earlier on Windows/macOS, such access is not restricted.

On Linux, try running the container as a local user `-u $(id -u ${USER}):$(id -g ${USER})`.
In the case of the image above, the solution will, unfortunately, not work. The `oracle` user is quite closely related to database initialization.
You will have to extend the image.

Please refer to the ["Running Docker Containers as Current Host User"](https://jtreminio.com/blog/running-docker-containers-as-current-host-user/) article for potential approaches and a detailed explanation of this solution.

> Here, the `podman` tool (fork-exec architecture) – a replacement for the `docker` tool (client-server architecture) – tries to improve the concept of user namespace through which host resources are accessed. The [`podman unshare`](https://docs.podman.io/en/latest/markdown/podman-unshare.1.html) command provides a quick way to identify and resolve any unprivileged access issues.
