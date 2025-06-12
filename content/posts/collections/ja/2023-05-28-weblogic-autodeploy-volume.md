---
title: Docker Composeを使ったWebLogicの自動デプロイ
url: weblogic-docker-compose-自動デプロイ
id: 111
category:
- jee: JEE
tags:
- weblogic
- クラスローディング
- docker
author: Damian Terlecki
date: 2023-05-29T20:00:00
---

Docker Composeは、多数のコンテナからなる開発環境を迅速に立ち上げるための便利なツールです。
Dockerイメージの文脈では、典型的な戦略は、アプリケーションの新しいバージョンを含む新しいイメージをビルドし、
それを外部環境にデプロイすることです。
開発環境のニーズに合わせて、同じコンテナを再利用してアプリケーションの新しいイテレーションをデプロイすることで、開発を加速できます。

<img src="/img/hq/wls-autodeploy-project-tree.png" title='非本番モードに基づいて自動デプロイの可否を判断するWebLogicの起動ログ' alt='非本番モードに基づいて自動デプロイの可否を判断するWebLogicの起動ログ – domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

WebLogicの場合、サーバーは自動デプロイ機能を提供しています。アーティファクトまたは展開されたアーカイブを`autodeploy`ディレクトリに
配置するだけです。Dockerのボリュームを使えば、
アプリケーションのアーティファクトを自動デプロイの場所にバインドできます。

ビルド時、アーティファクトは通常`build`（Gradle）または`target`（Maven）ディレクトリに生成されます。しかし、このパスを直接リンクすることは、
いくつかの理由から最善のアイデアではありません：
1. デプロイ不可能なサブディレクトリが含まれている。
2. アーティファクトがない場合、空のサブディレクトリに変わってしまう。
3. `mvn clean`を実行するたびに、次の再起動までボリュームバインドが失われたように見えることがある[（ファイルシステム固有）](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094)。

したがって、手動介入を必要としない信頼性の高い設定は、ボリュームを親ディレクトリにバインドすることです。

```bash
project/
├─ src/
│  ├─ main/
│  │  ├─ java/
│  │  │  ├─ .../
│  │  ├─ webapp/
│  │  │  ├─ WEB-INF/
│  │  │  │  ├─ web.xml
├─ target/
│  ├─ classes
│  ├─ wlsdemo
│  ├─ wlsdemo.war
├─ src/
│  ├─ index.css
│  ├─ index.js
├─ docker-compose.yml
├─ domain.properties
├─ pom.xml
```

上記のサンプルツリーで、`project`フォルダをコンテナ内の`/project`ディレクトリにバインドするには、次の`docker-compose.yml`を使用します。

```yaml
version: '3'
services:
  weblogic:
    build: ./
    environment:
      - "debugFlag=true"
      - "DEBUG_PORT=*:8453"
    ports:
      - "7001:7001" #admin_listen_port
      - "9002:9002" #secure administration_port
      - "8453:8453" #custom debug port
    volumes:
      - ./:/project
      - ./:/u01/oracle/properties
```

アーティファクトの自動デプロイは、ソフトリンクを使用して実装できます。以下の`Dockerfile`を見てください。
これは`docker-compose.yml`によって自動ビルドされます。`package`フェーズ中に
`maven-war-plugin`/`maven-ear-plugin`によって生成された展開済みアーカイブは、完全なアーティファクトと交換することもできます。

```Dockerfile
# Requires license acceptation at https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

`classes`サブフォルダの変更は継続的に監視され、クラスローダーのリロードを引き起こします。
[ドキュメント](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)では、
展開されたWAR/EARアーティファクトのWEB-INF/META-INF下にある`REDEPLOY`ファイルを更新することによる完全な再デプロイも記述されています。これを`package`フェーズの最後に配置された`maven-antrun-plugin`で自動化します。

```xml
    <build>
        <finalName>${artifactId}</finalName>
        <plugins>
            <!--...-->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-antrun-plugin</artifactId>
                <version>3.0.0</version>
                <executions>
                    <execution>
                        <id>touch-redeploy-file</id>
                        <phase>package</phase>
                        <goals>
                            <goal>run</goal>
                        </goals>
                        <configuration>
                            <target>
                                <touch file="${project.build.directory}/${project.artifactId}/WEB-INF/REDEPLOY"
                                       verbose="true" />
                            </target>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
</build>
```

この例では、`debugFlag`と`DEBUG_PORT`環境変数を使用しました。これらは
`/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh`スクリプトによって処理されます。要するに、これはすべてのネットワークインターフェースでデバッガモードを設定します（JDK 9+）。
これでデバッグが可能になり、
お気に入りのIDE（IntelliJ > Edit Configuration > Remote JVM Debug）が提供するJPDAホットスワップの利点を活用できます。

> `domain.properties`ファイルは、カスタム初期化スクリプトなしのクリーンなイメージに必要です。管理者ユーザー名とパスワードを次の形式で含める必要があります：
> ```properties
username=myadminusername
password=myadminpassword12#

> JVMデバッガーがアタッチするのを待ちたい場合は、`debugFlag`の代わりに`JAVA_OPTIONS`環境変数を直接設定してください。

> カスタムポートマッピングには注意してください。`t3`接続を確立するために[`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171)が必要になる場合があります。

