---
title: POM inválido devido a uma propriedade Maven não resolvida
url: maven-pom-invalido-propriedade-nao-resolvida
id: 108
category:
- java: Java
tags:
- maven
- jaxws
- jakarta
author: Damian Terlecki
date: 2023-04-14T20:00:00
---

O Maven usa o arquivo de configuração `pom.xml` para gerenciar a construção do projeto. Ao analisar o arquivo,
a ferramenta resolve as dependências do projeto e determina quais bibliotecas e ferramentas são necessárias para construir os artefatos.
No processo, o Maven também analisa arquivos POM externos para determinar dependências transitivas.

## Propriedade Maven não resolvida

Pode acontecer que um arquivo POM de uma biblioteca remota contenha erros, mais lógicos do que sintáticos.
Uma das razões para esses tipos de problemas é o uso de expressões que se referem a [propriedades do Maven](https://maven.apache.org/pom.html#Properties) inexistentes.
Em caso de erros durante o processamento de dependências, o Maven pulará o carregamento de artefatos transitivos, e veremos um aviso de exemplo:

<img src="/img/hq/maven-invalid-pom.png" title='[WARNING] O POM para com.sun.xml.ws:jaxws-rt:jar:2.2.10 é inválido, dependências transitivas (se houver) não estarão disponíveis, habilite o log de depuração para mais detalhes' alt='[WARNING] O POM para com.sun.xml.ws:jaxws-rt:jar:2.2.10 é inválido, dependências transitivas (se houver) não estarão disponíveis, habilite o log de depuração para mais detalhes'>

Você notará rapidamente que as dependências declaradas na biblioteca `pom.xml` são basicamente ignoradas e não podem ser resolvidas no projeto.
Para descobrir mais sobre a causa, adicione o parâmetro `-X`. É uma forma abreviada do parâmetro `--debug`.

> [ERROR] 'dependencyManagement.dependencies.dependency.systemPath' para com.sun:tools:jar deve especificar um caminho absoluto, mas é ${tools.jar} @

Neste caso particular, o Maven não consegue avaliar a expressão `${tools.jar}`.
Olhando para os arquivos `pom.xml`, concluímos que essa expressão é necessária para definir a dependência do sistema `tools` em um dos POMs pais:

```xml
<!--...-->
<profiles>
    <!--...-->
    <profile>
        <id>default-tools.jar</id>
        <activation>
            <file>
                <exists>${java.home}/../lib/tools.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../lib/tools.jar</tools.jar>
        </properties>
    </profile>
    <profile>
        <id>default-tools.jar-mac</id>
        <activation>
            <file>
                <exists>${java.home}/../Classes/classes.jar</exists>
            </file>
        </activation>
        <properties>
            <tools.jar>${java.home}/../Classes/classes.jar</tools.jar>
        </properties>
    </profile>
</profiles>
<!--...-->
<dependencyManagement>
    <dependencies>
        <!-- JDK dependencies -->
        <dependency>
            <groupId>com.sun</groupId>
            <artifactId>tools</artifactId>
            <version>1.6</version>
            <scope>system</scope>
            <systemPath>${tools.jar}</systemPath>
        </dependency>
    </dependencies>
    <!--...-->
</dependencyManagement>
<!--...-->
```

Após uma verificação mais aprofundada das dependências deste artefato em particular, você pode até chegar à conclusão de que a dependência do sistema não é usada neste submódulo.
Infelizmente, a falta de um arquivo no local `${java.home}/../lib/tools.jar` ou `${java.home}/../Classes/classes.jar` torna a variável `${tools.jar}` não inicializada.

Específico deste exemplo, o problema está relacionado à versão JDK 11+. Nesta versão, as ferramentas mencionadas foram removidas.
Essa mudança é suportada a partir do `jaxws-rt:2.3.x`, o que também acarreta uma atualização de especificação relevante para esta biblioteca.

No geral, o problema é mais genérico e pode ser extrapolado para uma situação em que o Maven não consegue avaliar uma expressão ao resolver dependências externas.
Temos alguma influência sobre isso?

## Avaliação de expressão do arquivo POM

A ordem de avaliação da fonte das propriedades é implementada no [`org.apache.maven.model.interpolation.AbstractStringBasedModelInterpolator`](https://github.com/apache/maven/blob/maven-3.9.1/maven-model-builder/src/main/java/org/apache/maven/model/interpolation/AbstractStringBasedModelInterpolator.java#L99-L175) para o Maven v3/4 e
pode ser simplificada da seguinte forma:
- Propriedades Java – `-Dkey=value`;
- Propriedades Maven – `<properties><key>value</key></properties>`;
- Variáveis de ambiente – `set/export key=value`.

Em um projeto multi-módulo, as propriedades do Maven podem ser herdadas pelos submódulos dentro do mesmo projeto. No entanto, essas variáveis não são propagadas automaticamente para as dependências externas do projeto.
Por outro lado, as variáveis Java e de ambiente são inicializadas no início do processamento do Maven, portanto, adicioná-las durante a execução não afeta a avaliação.
Além disso, no caso de dependências externas, as variáveis Java são consolidadas ao nível das variáveis de ambiente ([MNG-7563](https://issues.apache.org/jira/browse/MNG-7563)).

Conhecendo as regras acima, você pode inicializar uma propriedade do Maven no `pom.xml` externo de várias maneiras diferentes, por exemplo, através de:
- Variável de ambiente (cuidado com problemas ao exportar variáveis contendo pontos em sistemas do tipo Unix);
- Propriedade Java inicializada usando a linha de comando `mvn -Dkey=value validate`;
- Variável de ambiente no início do comando `key=value mvn validate`;
- Arquivo de configuração do Maven relativo ao projeto `.mvn/maven.config` que define a Propriedade Java `-Dkey=value`;
- Comandos de execução globais definidos em, por exemplo, `~/.mavenrc` que definem a variável de ambiente `set/export key=value` (cuidado com problemas no IntelliJ, por exemplo, [IDEA-19759](https://youtrack.jetbrains.com/issue/IDEA-19759/.mavenrc-file-not-loaded-by-runner)).

O último recurso é certamente baixar manualmente (ou indiretamente) a dependência e adicioná-la aos caminhos de compilação/construção do artefato.

> Como ferramenta de construção alternativa, o Gradle v4-8 se sai um pouco melhor aqui. Ele não lança um erro para dependências não afetadas, e os artefatos são importados corretamente.
