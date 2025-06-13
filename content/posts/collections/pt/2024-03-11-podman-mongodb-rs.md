---
title: Armadilhas do Replica Set do MongoDB com Podman (Compose)
url: armadilhas-replica-set-mongodb-com-podman-compose
id: 126
category:
- databases: Bancos de Dados
tags:
- mongodb
- docker
- podman
author: Damian Terlecki
date: 2024-03-11T20:00:00
---

Você pode encontrar facilmente na internet configurações funcionais de docker/docker-compose para configurar um replica set do MongoDB.
No entanto, nenhuma funcionou quando precisei configurar uma conexão a partir de uma máquina host Linux com o podman-compose.
Para delinear o problema, digamos que um replica set é geralmente [iniciado](https://www.mongodb.com/docs/v7.0/reference/method/rs.initiate/) através de um shell após conectar-se a uma instância `mongod` rodando com `--replSet` e `--bind_ip`
(opcionalmente `--port`):

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

## Um hostname para governar todos

Os membros `host` definidos na configuração devem ser acessíveis tanto de cada nó quanto do lado do cliente.
Muitas vezes, [você encontrará `host.docker.internal`](https://medium.com/workleap/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need-2f0b74dd8384)
sendo usado no lugar de `mongodbN.example.net`.
Em uma rede `bridge` padrão, ele é mapeado para o `host-gateway` da rede docker usando a propriedade `extra_hosts` do serviço.
Ao usar o Podman, existe um equivalente `host.containers.internal` que deve funcionar sem definir os `extra_hosts`.

> **Nota:** se você se deparar com um 'invalid IP address in add-host: "host-gateway"', você pode estar rodando uma versão antiga do
> docker engine/podman no Linux. Nos casos mais básicos, você pode trocá-lo por `172.17.0.1`, mas isso pode variar ao rodar com
> múltiplas redes.
> Confira [este tópico do SO](https://stackoverflow.com/questions/48546124/what-is-the-linux-equivalent-of-host-docker-internal)
> para encontrar soluções melhores, mas mais complexas.

Alternativamente, você pode usar o nome do serviço ou configurar `container_name` e `hostname` do serviço para configurar um RS com hostnames personalizados.

## Vínculos de porta

A segunda armadilha é a configuração das portas. Uma única rede `bridge` significa que as portas para cada nó devem ser diferentes (ex: `27017`, `27018`, `27019`) e corresponder
à definição dos membros, à configuração do `mongod`
e aos vínculos de porta do host.

Incompatibilidades podem levar a:
- remoção de um nó da visão do cluster pelo cliente (o endereço canônico do nó não corresponde ao endereço do servidor);
- problemas para acessar todos os nós da máquina host;
- erros de iniciação do RS ao tentar encontrar a si mesmo na configuração do replset.

## UnknownHostException

A terceira armadilha é que `host.docker.internal` não é resolvível em hosts Linux e requer a adição de uma entrada
no `/etc/hosts` que mapeia para o endereço de loopback padrão
`127.0.0.1`. No entanto, com o
Podman, [os `/etc/hosts` do host são incluídos nos `/etc/hosts` dos contêineres](https://github.com/containers/podman/issues/11835),
causando erros de iniciação do RS.

<figure class="flex">
  <img src="/img/hq/mongo-rs-podman-hosts-copy.png" alt="Captura de tela da entrada 'host.docker.internal' duplicada do host da máquina no '/etc/hosts' do contêiner." title="Entrada 'host.docker.internal' duplicada do host da máquina no '/etc/hosts' do contêiner">
  <img src="/img/hq/mongo-rs-podman-host-copy-repl-error.png" alt="Captura de tela de um erro de replicação devido à duplicação de 'host.docker.internal' no '/etc/hosts', resultando no IP errado." title="Erro de replicação devido a uma entrada 'host.docker.internal' duplicada no '/etc/hosts' resolvendo para o IP errado">
</figure>

A opção `--no-hosts` foi disponibilizada recentemente (Podman 4.0), mas entra em conflito com `host.containers.internal`/`host.docker.internal`.
Uma solução grosseira que funciona é atualizar o `/etc/hosts` do contêiner antes da inicialização do `mongod`.
No entanto, é muito melhor desabilitar esse comportamento globalmente
também através da mais recente propriedade de configuração (Podman 4.1) em
[`$HOME/.config/containers/containers.conf`](https://github.com/containers/common/blob/v0.58/docs/containers.conf.5.md#description):

```shell
[containers]
base_hosts_file="none"
```

## Resumo

Se você encontrar problemas ao configurar um replica set do MongoDB dockerizado para desenvolvimento, especialmente no Linux ou usando Podman, revise o
seguinte:
- Replica sets devem ser configurados com combinações de hostnames e portas alcançáveis de cada nó, bem como do
  cliente (ex: máquina host);
- Use portas distintas para cada nó para que a visão do RS corresponda ao vínculo de porta em uma rede `bridge`;
- Use `host.docker.internal` (pode exigir `extra_hosts`)/`host.containers.internal` (Podman) para a propriedade `host`
  dos membros;
- Alternativamente, use `container_name` e `hostname` do serviço se precisar configurar um RS com hostnames personalizados;
- Em caso de erro de hostname inalcançável na máquina host, adicione os hostnames do RS ao `/etc/hosts` do host;
- Desabilite a cópia do `/etc/hosts` da máquina host através do arquivo `containers.conf` para o Podman;
- Como último recurso no Linux, use a propriedade do serviço `network_mode: host` e conecte-se ao RS no localhost
  imediatamente.
