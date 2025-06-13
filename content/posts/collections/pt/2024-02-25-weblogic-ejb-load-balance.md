---
title: EJB do WebLogic e balanceamento de carga
url: weblogic-ejb-balanceamento-de-carga
id: 125
category:
- jee: JEE
tags:
- weblogic
- desempenho
author: Damian Terlecki
date: 2024-02-25T20:00:00
---

Recentemente, me perguntaram sobre o recurso de balanceamento de carga de interfaces `@Remote` `@EJB` no WebLogic.
As interfaces remotas são balanceadas? Isso depende do contexto? A invocação é balanceada ou apenas a busca (lookup)?
Do lado do cliente, podemos descobrir qual nó do cluster processou a requisição?
Entender esses conceitos é fundamental para melhorar a capacidade de implementar processos performáticos e escaláveis.

## Características de balanceamento de carga para interfaces remotas de EJB stateless

Para responder a essas perguntas, vamos primeiro consultar [a documentação do WebLogic 14.1.1.0](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/clust/load_balancing.html#GUID-2470EEE9-F6F9-44EF-BA54-671728E93DE6)
(embora você encontre semelhanças até mesmo nas versões mais antigas).
Ela descreve as características de balanceamento de carga para interfaces remotas de EJB stateless.
Em resumo, você pode ter dois tipos de conexões:
1. cliente para servidor;
2. servidor para servidor.

As conexões e invocações de cliente para servidor são balanceadas usando uma de três estratégias: round-robin (padrão), baseada em peso ou aleatória.
Alternativamente, o balanceamento de carga pode ser desativado em favor da afinidade de servidor (server-affinity).
Com a afinidade de servidor, você ainda está sujeito ao balanceamento de carga, mas apenas se usar
a URI do cluster em vez do servidor gerenciado, e apenas no nível de criação de um novo contexto inicial.
Todas essas opções suportam failover.

Para conexões de servidor para servidor, é essencial entender que a opção de afinidade de servidor não afeta o balanceamento de carga entre os servidores.
Além disso, dentro de um cluster, o WLS sempre usará um EJB que reside no mesmo nó que recebeu a requisição, pois é muito mais eficiente.
A chamada colocação de objetos (object collocation) torna o uso de interfaces `@Remote` dentro de `@EJB`s subótimo (serialização desnecessária).
Coincidentemente, um comportamento semelhante é descrito para o tratamento de `UserTransaction` do cliente e, opcionalmente, para XA.

<img src="/img/hq/weblogic-cluster-load-balancing.svg" title="Balanceamento de Carga de EJB Remoto do WebLogic (simplificado)" alt="Gráfico de Balanceamento de Carga de EJB Remoto do WebLogic (simplificado)">

Nenhuma colocação (pelo contrário – balanceamento de carga) acontece entre clusters separados, por exemplo, em uma configuração de cluster por camada de uma aplicação web de múltiplas camadas.
Se você não quiser a colocação, a opção alternativa para processamento é através de destinos JMS com balanceamento de carga.
Caso contrário, imagino que você poderia fazer um proxy da busca através de um classloader personalizado atuando como um cliente WLS, mas isso não é algo testado ou recomendado.

## Descobrindo qual servidor tratou minha requisição (cliente)

Às vezes, você pode querer saber quais servidores tratam algumas requisições específicas.
Certa vez, encontrei uma implantação dessincronizada de uma nova versão de aplicação em um cluster que resultou no recebimento de duas respostas diferentes
de maneira round-robin. Descobrir como vincular a resposta a um servidor específico
permitiu-me resolver o problema sem uma reimplementação desnecessária ou desligar todo o cluster.

Uma maneira é implementar logs identificáveis de requisição/resposta.
Existe algo que poderíamos usar ad-hoc?
Se você já trabalhou com o WLS, talvez já saiba que tal informação pode estar presente em algum lugar
dentro dos objetos da [biblioteca `wlthint3client.jar`](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/wlthint3client.html#GUID-4EB44FDC-51E6-43B0-8963-D1101238CAD9).
Ela é usada para se conectar ao WLS и contém a lógica de balanceamento de carga para o protocolo `t3`.

Mas há mais do que isso. Para o balanceamento de carga, há um logger específico que você pode usar.
Sem ele, você teria que depender da criação de um wrapper personalizado em torno das chamadas de stub do EJB que acessa o estado interno do balanceador de carga referenciado.

<img src="/img/hq/weblogic-remote-ejb-stub-cluster-ref.png" title='Avaliação de depuração no IntelliJ do nome do WLS que processou recentemente a invocação do EJB "myRemoteRef"' alt="Captura de tela da avaliação de depuração no IntelliJ do nome do WLS que processou recentemente a invocação do EJB">

O logging do *Wlthint3client* usa JUL (Java Util Logging) por baixo dos panos. Para uma integração com um framework de logging de terceiros, procure por uma ponte como `jul-to-slf4j`.
Para habilitar o logging, inicie a aplicação com a propriedade JVM `-Dweblogic.debug.DebugLoadBalancing` ou faça isso programaticamente para o logger compartilhado:

<img src="/img/hq/weblogic-debug-load-balancing.png" title="Depurador DebugLoadBalancing do WebLogic" alt="Depurador DebugLoadBalancing do WebLogic">

```java
weblogic.diagnostics.debug.DebugLogger
        .getDebugLogger("DebugLoadBalancing")
        .setDebugEnabled(false);
```

Em seguida, você deve configurar o nível de logging e o appender de acordo com seu framework.
Aqui, o `displayName` é o nome do logger com o prefixo `Debug` removido, ou seja, o nome do logger JUL se torna `LoadBalancing`.
Com isso, você pode esperar entradas de log como as abaixo:

```plaintext
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1 to 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2 to 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3 to 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1
```

Combinado com o nome da thread e a hora (formato de logging), ou outras informações relacionadas ao contexto, permite vincular cada requisição a um processo de negócio específico e a um nó EJB.
Outro logger útil é o `DebugFailOver` e, em menor grau, o `DebugMessaging`. O último funciona principalmente após um `-Dweblogic.kernel.debug=true` adicional e exibe
mensagens no console em um formato "byte-pretty".
