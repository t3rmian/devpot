---
title: Pacotes preferenciais do WebLogic usando REGEX
url: weblogic-pacotes-preferenciais-regex
id: 110
category:
- jee: JEE
tags:
- weblogic
- classloading
- docker
author: Damian Terlecki
date: 2023-05-14T20:00:00
---

<img src="/img/hq/wls-prefer-application-packages.png" title='Um trecho do conteúdo do descritor do servidor WebLogic que separa pacotes: EL=aplicação, MOXy=WLS (compatível com metro-jax-ws)' alt='<wls:container-descriptor><wls:prefer-application-packages><wls:package-name>org.eclipse.persistence(?!\.jaxb)</wls:package-name></wls:prefer-application-packages></wls:container-descriptor>'>

O servidor Java EE – WebLogic – oferece um recurso para sobrescrever as bibliotecas fornecidas como padrão pelo contêiner.
[Tal configuração](/posts/weblogic-library-conflicts) é possível através do descritor `weblogic.xml` colocado na pasta `WEB-INF` de um artefato WAR ou do descritor `weblogic-application.xml`
colocado no diretório `META-INF` de um arquivo EAR.

Você encontrará facilmente exemplos de uso dos elementos `prefer-application-packages` e `prefer-application-resources` para carregar classes e recursos, respectivamente.
Os filtros de exemplo às vezes (e às vezes não) terminam com um sufixo `.*`, assemelhando-se a REGEX ou GLOB.
A documentação, no entanto, não explica os detalhes deste formato, que são bastante significativos quando se deseja aplicar uma filtragem complexa.

```xml
<wls:container-descriptor>
    <wls:prefer-application-packages>
        <wls:package-name>com.sample.*</wls:package-name>
    </wls:prefer-application-packages>
</wls:container-descriptor>
```

A configuração acima prefere classes dos pacotes `com.sample`, `com.sample.example`, `com.sample.example.subexample`, ou uma dessas combinações?
Como configurar uma correspondência para todos os pacotes de `com.sample.*` exceto `com.sample.example`?
É possível filtrar as classes até o nome completo, ou o recurso se aplica apenas a pacotes (inferido pelo nome do elemento)?

## FilteringClassLoader do WebLogic

Todas as perguntas levam ao código. `FilteringClassLoader` é a classe a ser procurada entre as dependências fornecidas pelo WebLogic.
Este nome vem do relatório de outra ferramenta útil – a Classloader Analysis Tool.
Você encontrará essa classe assim que carregar a biblioteca cliente do protocolo T3 `${WL_HOME}/server/lib/wlthint3client.jar`.
Mais precisamente, ela reside no pacote `weblogic.utils.classloaders`.

Devido a razões de licenciamento, a biblioteca não pode ser resolvida a partir de um repositório Maven Central.
Para fins de verificação, você pode extraí-la de um contêiner da imagem docker oficial como uma alternativa à instalação do WLS:
```bash
#!/bin/bash
# Faça login, revise e aceite a licença em https://container-registry.oracle.com/ > Middleware > weblogic 
docker login container-registry.oracle.com
image=container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev
sourcePath=/u01/oracle/wlserver/server/lib/wlthint3client.jar
destinationPath=./
containerId=$(docker create "$image")
docker cp "$containerId:$sourcePath" "$destinationPath"
docker rm "$containerId"
```

Agora, o bytecode do `weblogic.utils.classloaders.FilteringClassLoader` parece se traduzir no seguinte algoritmo:
1. Carregar o padrão e remover o caractere `*` final;
2. Adicionar o sufixo `{0,1}` se o padrão terminar em `.`;
3. Prefixar o padrão com `^`;
4. Criar `java.util.regex.Pattern` e chamar `matcher(String)` para o nome completo da classe/recurso usando o método `find()`.
5. Se nenhuma correspondência for encontrada, delegar o carregamento de `loadClass/getResourceInternal/getResource/getResources` para o classloader pai, caso contrário, retornar a classe/recurso fornecido pela aplicação.

Isso mostra que os elementos `prefer-application-packages` e `prefer-application-resources` permitem uma filtragem fina de pacotes e recursos, bem como de classes individuais usando REGEX.
Note que existem algumas adições, por exemplo, com relação aos caracteres de início e fim `*` e `.`.

O caractere de fim de linha não é adicionado ao padrão. Combinado com o uso do método `find()`, isso aumenta o número de pacotes filtrados devido à correspondência parcial (como alternativa ao `matches()`).
Além disso, o separador de pacote funciona aqui como uma correspondência de caractere arbitrária, o que à primeira vista pode ser ambíguo e, muito raramente, pode levar a uma filtragem mais ampla do que o pretendido.

Finalmente, o mecanismo permite que você defina uma expressão regular que pulará o subpacote. Tal expressão (por exemplo, `^com.sample(?!\.example$)`) causará um fallback para o conjunto de bibliotecas fornecido pelo WLS se nenhuma outra correspondência for encontrada.
No entanto, tente usar expressões simples. O backtracking excessivo pode levar a um aumento no tempo de inicialização da aplicação.

