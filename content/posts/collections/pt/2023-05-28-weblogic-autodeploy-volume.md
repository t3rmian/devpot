---
title: Autodeploy no WebLogic com Docker Compose
url: weblogic-autodeploy-docker-compose
id: 111
category:
- jee: JEE
tags:
- weblogic
- classloading
- docker
author: Damian Terlecki
date: 2023-05-29T20:00:00
---

O Docker Compose é uma ferramenta prática que permite levantar rapidamente um ambiente de desenvolvimento composto por muitos
contêineres. No contexto de imagens docker, a estratégia típica é construir uma nova imagem com uma nova
versão da aplicação e implantá-la em um ambiente externo.
Para as necessidades do ambiente de desenvolvimento, você pode acelerar isso reutilizando o mesmo contêiner para implantar uma nova iteração da aplicação.

<img src="/img/hq/wls-autodeploy-project-tree.png" title='Logs de inicialização do WebLogic que determinam a disponibilidade do auto-deploy com base no modo de não produção' alt='Logs de inicialização do WebLogic que determinam a disponibilidade do auto-deploy com base no modo de não produção – domain_name: [base_domain]; admin_listen_port: [7001]; domain_path: [/u01/oracle/user_projects/domains/base_domain]; production_mode: [dev]; admin name: [AdminServer]; administration_port_enabled: [true]; administration_port: [9002]'>

No caso do WebLogic, o servidor oferece um recurso de implantação automática. Tudo que você precisa fazer é colocar o
artefato ou um arquivo "explodido" (exploded archive) no diretório `autodeploy`. Com
a ajuda dos volumes do Docker, você pode vincular os artefatos da aplicação ao local de implantação automática.

Ao construir, os artefatos são geralmente gerados no diretório `build` (Gradle) ou `target` (Maven). No entanto, vincular diretamente esse caminho não é a melhor ideia
por várias razões:
1. Ele contém subdiretórios não implantáveis.
2. Um artefato ausente se transformará em um subdiretório vazio.
3. A cada `mvn clean`, o vínculo do volume pode parecer perdido até o próximo reinício [(específico do sistema de arquivos)](https://pawitp.medium.com/syncing-host-and-container-users-in-docker-39337eff0094).

Portanto, uma configuração confiável que não requer intervenção manual é vincular o volume ao diretório pai.

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

Na árvore de exemplo acima, para vincular a pasta `project` ao diretório `/project` dentro do contêiner, use o seguinte `docker-compose.yml`:

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

Você pode implementar a implantação automática de artefatos usando um link simbólico. Dê uma olhada no `Dockerfile` abaixo.
Ele é construído automaticamente pelo `docker-compose.yml`. O arquivo "explodido" gerado pelo
`maven-war-plugin`/`maven-ear-plugin` durante a fase `package` também pode ser trocado por um artefato completo.

```Dockerfile
# Requer aceitação da licença em https://container-registry.oracle.com/ Middleware > WebLogic
FROM container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11
RUN mkdir -p /u01/oracle/user_projects/domains/base_domain/autodeploy/ \
    && /usr/bin/ln -s /project/target/wlsdemo \
    /u01/oracle/user_projects/domains/base_domain/autodeploy/wlsdemo
```

A modificação da subpasta `classes` é monitorada continuamente e faz com que o class loader seja recarregado.
A [documentação](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/depgd/autodeploy.html)
também descreve uma reimplementação completa através da atualização do arquivo `REDEPLOY` (sob o WEB-INF/META-INF do
artefato WAR/EAR "explodido"). Automatize isso com o `maven-antrun-plugin` colocado como o último durante a fase `package`.

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

No exemplo, usei as variáveis de ambiente `debugFlag` e `DEBUG_PORT`. Elas são tratadas pelo
script `/u01/oracle/user_projects/domains/base_domain/bin/setDomainEnv.sh`. Em suma, isso configura o modo de depuração em todas as interfaces de rede (JDK 9+).
Agora você pode depurar
e aproveitar o hot swap do JPDA facilitado pelo seu IDE favorito (IntelliJ > Edit Configuration > Remote JVM Debug).

> O arquivo `domain.properties` é necessário para uma imagem limpa sem scripts de inicialização personalizados. Ele deve conter o nome de usuário e a senha do administrador no seguinte formato:
> ```properties
username=meunomedeusuarioadmin
password=minhasenhadeadmin12#

> Se você quiser esperar que o depurador da JVM se conecte, configure a variável de ambiente `JAVA_OPTIONS` diretamente em vez do `debugFlag`.

> Tenha cuidado com o mapeamento de portas personalizado. Pode ser necessário [`-Dweblogic.rjvm.enableprotocolswitch=true`](https://github.com/oracle/docker-images/issues/575#issuecomment-763709171) para estabelecer uma conexão `t3`.

