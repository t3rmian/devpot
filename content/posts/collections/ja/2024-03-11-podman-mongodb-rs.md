---
title: Podman (Compose)を使ったMongoDBレプリカセットの注意点
url: mongodb-レプリカセット-podman-compose-注意点
id: 126
category:
- databases: データベース
tags:
- mongodb
- docker
- podman
author: Damian Terlecki
date: 2024-03-11T20:00:00
---

インターネット上では、MongoDBレプリカセットをセットアップするための、動作するdocker/docker-compose設定を簡単に見つけることができます。
しかし、Linuxホストマシンからpodman-composeで接続設定をしようとしたとき、なぜか、どれもうまくいきませんでした。
問題を概説すると、通常レプリカセットは、`--replSet`と`--bind_ip`（オプションで`--port`）を付けて実行されている`mongod`インスタンスに接続した後、シェルを通じて[初期化](https://www.mongodb.com/docs/v7.0/reference/method/rs.initiate/)されます。

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

## すべてを支配する1つのホスト名

設定で定義されたホストメンバーは、各ノードからとクライアント側の両方からアクセス可能でなければなりません。
`mongodbN.example.net`の代わりに`host.docker.internal`が使用されているのを[よく見かけるでしょう](https://medium.com/workleap/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need-2f0b74dd8384)。
デフォルトのブリッジネットワークでは、これはサービスの`extra_hosts`プロパティを使用して、Dockerネットワークの`host-gateway`にマッピングされます。
Podmanを使用する場合、同等の`host.containers.internal`があり、これはextra hostsを定義しなくても動作するはずです。

> **注意：** 'invalid IP address in add-host: "host-gateway"'というエラーが出た場合、Linux上で古いバージョンのdockerエンジン/podmanを実行している可能性があります。最も基本的なケースでは、これを`172.17.0.1`に交換できますが、複数のネットワークで実行している場合は異なる場合があります。
> より良いがより複雑な解決策を見つけるには、[このSOスレッド](https://stackoverflow.com/questions/48546124/what-is-the-linux-equivalent-of-host-docker-internal)を確認してください。

あるいは、サービス名を使用するか、サービスの`container_name`と`hostname`を設定して、カスタムホスト名でRSをセットアップすることもできます。

## ポートバインディング

2番目の注意点はポート設定です。単一のブリッジは、各ノードのポートが異なる必要があること（例：`27017`、`27018`、`27019`）を意味し、
メンバーの定義、`mongod`の設定、およびホストのポートバインディングと一致しなければなりません。

不一致があると、次のような問題が発生する可能性があります：
- クライアントのクラスタビューからノードが削除される（ノードの正規アドレスがサーバーアドレスと一致しない）。
- ホストマシンからすべてのノードにアクセスする際に問題が発生する。
- レプリカセット設定で自分自身を見つけようとしてRSの初期化エラーが発生する。

## UnknownHostException

3番目の注意点は、`host.docker.internal`はLinuxホストでは解決できず、デフォルトのループバックアドレス`127.0.0.1`にマッピングするエントリを`/etc/hosts`に追加する必要があることです。
しかし、Podmanでは、[ホストの`/etc/hosts`がコンテナの`/etc/hosts`に含まれる](https://github.com/containers/podman/issues/11835)ため、RSの初期化エラーが発生します。

<figure class="flex">
  <img src="/img/hq/mongo-rs-podman-hosts-copy.png" alt="コンテナの`/etc/hosts`にホストマシンから複製された`host.docker.internal`エントリのスクリーンショット" title="ホストマシンからコンテナの`/etc/hosts`に複製された`host.docker.internal`エントリ">
  <img src="/img/hq/mongo-rs-podman-host-copy-repl-error.png" alt="`/etc/hosts`内の重複した`host.docker.internal`が間違ったIPに解決されることによるレプリケーションエラーのスクリーンショット" title="`/etc/hosts`内の重複した`host.docker.internal`が間違ったIPに解決されることによるレプリケーションエラー">
</figure>

`--no-hosts`オプションは最近（Podman 4.0）利用可能になりましたが、`host.containers.internal`/`host.docker.internal`と競合します。
場当たり的ですが、`mongod`の起動前にコンテナの`/etc/hosts`を更新するという解決策があります。
しかし、最新の（Podman 4.1）設定プロパティを介して、この動作をグローバルに無効にする方がはるかに優れています。
場所は[`$HOME/.config/containers/containers.conf`](https://github.com/containers/common/blob/v0.58/docs/containers.conf.5.md#description)です。

```shell
[containers]
base_hosts_file="none"
```

## まとめ

特にLinux上やPodmanを使用して、開発用にDocker化されたMongoDBレプリカセットを設定する際に問題が発生した場合は、
以下を確認してください：
- レプリカセットは、各ノードおよびクライアント（例：ホストマシン）から到達可能なホスト名とポートの組み合わせで設定する必要があります。
- 各ノードに異なるポートを使用して、RSビューがブリッジネットワーク上のポートバインディングと一致するようにします。
- メンバーのホストプロパティには`host.docker.internal`（`extra_hosts`が必要な場合あり）/`host.containers.internal`（Podman）を使用します。
- カスタムホスト名でRSを設定する必要がある場合は、代わりにサービスの`container_name`と`hostname`を使用します。
- ホストマシンでホスト名に到達できないエラーが発生した場合は、ホストの`/etc/hosts`にRSホスト名を追加します。
- Podmanの場合、`containers.conf`ファイルを介してホストマシンからの`/etc/hosts`のコピーを無効にします。
- Linuxでの最後の手段として、サービスのプロパティ`network_mode: host`を使用し、localhost上のRSにすぐに接続します。
