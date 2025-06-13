---
title: Teste de Carga com JMeter
url: teste-de-carga-com-jmeter
id: 12
category:
- testing: Testes
tags:
- jmeter
- desempenho
author: Damian Terlecki
date: 2019-09-08T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

JMeter é uma ótima ferramenta de teste. Ele brilha especialmente durante os testes de carga. Você não só pode testar o desempenho da aplicação ou do banco de dados usando diferentes interfaces, mas também é capaz de gerar vários níveis de carga, simulando um influxo de usuários paralelos. Dependendo do caso de uso, você pode querer testar diferentes situações, por exemplo:
* a carga máxima que o sistema pode suportar;
* qual componente é o gargalo:
  - o banco de dados;
  - o backend;
  - um nó específico em microsserviços;
  - o frontend;
* se o sistema é escalável (verticalmente/horizontalmente);
* se o balanceamento de carga funciona corretamente;
* se o sistema está configurado e escalado de forma otimizada entre os diferentes componentes.

### Análise

Antes de começar a preparar os testes, você deve analisar como seu sistema é usado e quais são os casos de uso mais comuns. É importante lembrar de quaisquer tarefas em segundo plano e de quaisquer métodos específicos que possam ser usados muito raramente, mas que, em combinação com o aumento da carga, possam fazer seu sistema engasgar. O próximo passo, após definir quais interfaces devem ser testadas e sua proporção de uso, é planejar a sequência e a duração da execução. Considere escolher tempo suficiente para que o coletor de lixo seja invocado várias vezes. Alguma diversidade também pode ser necessária para alcançar uma situação de pior caso para o banco de dados ou sua camada de cache. Por último — o número de threads paralelas (usuários) que atingirão o sistema deve ser planejado juntamente com o aumento da carga.

Alguns tópicos secundários que valem a pena considerar são:
* em que ambiente os testes serão executados:
  - conexão;
  - hardware;
  - software;
  - configuração;
  - comparação com a produção;
* se um backup é necessário;
* se um PC será capaz de gerar carga suficiente;
* se todas as pessoas estão pré-treinadas para executar os testes e têm o acesso necessário;
* que outras ferramentas são necessárias para fins de monitoramento (por exemplo, Zipkin/Kibana/Nagios);
* como os dados de entrada serão carregados:
  - do banco de dados durante os testes;
  - do banco de dados no início do teste;
  - de um arquivo de entrada;
* qual é o objetivo real;
* como analisar os resultados e que tipos de relatórios criar.

Como você pode ver, há muitos pontos em aberto que devem ser esclarecidos durante a análise. Um plano adequado é essencial para obter resultados significativos que permitam a comparação com testes futuros.

### Implementação de exemplo

Uma implementação básica dos testes de carga inclui os seguintes passos e elementos:
1. Configurar (opcionalmente parametrizar) a conexão com as interfaces [*Plano de Teste/Variáveis de Usuário/Padrões de Configuração*].
2. Carregar dados de entrada [*Grupo de Threads de Configuração (setUp Thread Group)*]:
  - do banco de dados [*Configuração JDBC/Amostrador*];
  - de um arquivo CSV [*Configuração CSV*].
3. Preparar os casos de teste que chamam as interfaces [*Grupo de Threads*]:
  - randomizar os dados de entrada para uma única execução [*Configuração CSV/Pré-Processador JSR223*];
  - randomizar proporcionalmente qual interface chamar [*Controladores*];
  - definir requisitos adicionais:
    - número de threads a serem reunidas para atingir picos curtos [*Temporizadores*];
    - chamadas de interface adicionais que são esperadas no cenário [*Amostradores*].
4. Adicionar uma visualização agregada para monitorar o teste [*Ouvintes*].

<img src="/img/lazy/jmeter/jmeter-load-tests.jpg" data-src="/img/hq/jmeter/jmeter-load-tests.png" alt="Plano de Teste de Carga" title="Plano de Teste de Carga">

Note que quanto mais simples forem os testes, mais rápido eles serão executados e uma carga maior poderá ser gerada. Além disso, ao simplificá-los, você pode diminuir o número de possíveis pontos de falha. Vamos pegar o passo 2 como exemplo. Se decidirmos nos conectar ao banco de dados em nossos testes, aumentamos a complexidade dos testes e as dependências. Por exemplo, não é recomendado armazenar a senha do banco de dados dentro dos testes. Você pode querer compartilhá-los para uma revisão, fazer upload para o repositório ou entregá-los às pessoas que os executarão fora do horário de expediente. Nem todos que têm acesso a eles, também têm/deveriam ter acesso ao banco de dados. Também é possível fornecer credenciais erradas e perder algum tempo, especialmente quando você tem uma janela de tempo limitada para executar os testes.

Outro problema pode ocorrer quando você quiser gerar uma carga muito grande, aumentando o número de execuções do plano de teste (várias pessoas/máquinas). Se você não sincronizar a consulta ao banco de dados para os dados de entrada, é possível que a aplicação consuma todos os recursos do banco de dados (conexões). Nesse caso, você pode obter timeouts durante a etapa de configuração, tornando efetivamente os próximos passos não confiáveis. Portanto, nesse caso, carregar dados pré-buscados (por exemplo, um dia antes) é preferível. No entanto, se você não estiver pressionado pelo tempo, pode testar as coisas por si mesmo.

Para uma implementação exemplar, você pode verificar as fontes vinculadas na parte inferior da página. O projeto tem uma API REST implementada em Spring e contém alguns testes de carga simples. Por favor, leia o README para a configuração adequada (o driver do banco de dados precisa ser baixado e colocado no classpath do JMeter).

#### Escopo de variáveis do JMeter

No JMeter, as variáveis têm escopo por thread. O que isso significa é que, se você carregar os dados no *Grupo de Threads de Configuração (setUp Thread Group)*, eles não estarão acessíveis aos Grupos de Threads relevantes responsáveis por chamar as interfaces. Claro, você pode colocar a lógica de carregamento dentro deles, mas em algumas situações, isso pode não ser viável. Você pode não querer gerar nenhuma carga artificial no banco de dados durante o tempo de teste. Nesse caso, você pode contornar isso usando as propriedades do JMeter, que são compartilhadas entre os *Grupos de Threads*. Para salvar a propriedade na thread de configuração, use:
- função [__setProperty](https://jmeter.apache.org/usermanual/functions.html#__setProperty);
- [Amostrador JSR223](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Pós-Processador e objeto JMeterProperties *props* com interface `java.util.Properties` — permite salvar variáveis do conjunto de resultados JDBC.

Ler essas propriedades é tão simples quanto usar:
- função [__P](https://jmeter.apache.org/usermanual/functions.html#__P) ou [__property](https://jmeter.apache.org/usermanual/functions.html#__property);
- [Amostrador JSR223](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Pré-Processador e objeto *props*.

As propriedades também são usadas para recuperar parâmetros passados na linha de comando com o prefixo `-J`, por exemplo, `-Jparametro=valor`.

#### Randomizando os dados

Depois de compartilhar os dados de entrada, você pode randomizá-los para uma única execução e salvar as informações necessárias em uma variável. Ela estará acessível posteriormente no mesmo Grupo de Threads usando a sintaxe `${nome_da_variavel}` e cada thread terá efetivamente uma entrada diferente.

```groovy
import java.util.Random; 

Random rand = new Random(); 
def index = rand.nextInt(props.get("resultSet").size());
vars.put("id", props.get("resultSet").get(index).get("USER_ID").toString());
```

Você também pode querer comparar outras maneiras de gerar números aleatórios. Eu executei alguns testes de desempenho que consistiam em gerar e registrar um número inteiro aleatório. Note que eles foram executados de forma relaxada e são apenas para referência rápida (10 threads x 100000 repetições):

<table class="rwd">
   <thead>
      <tr>
         <th>Randomizador</th>
         <th>Taxa de transferência [execs/seg]</th>
         <th>Nota</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Randomizador">
            java.util.Random
         </td>
         <td data-label="Taxa de transferência [execs/seg]">
            10900
         </td>
         <td data-label="Nota">
            -
         </td>
      </tr>
      <tr>
         <td data-label="Randomizador">
            java.util.concurrent.ThreadLocalRandom
         </td>
         <td data-label="Taxa de transferência [execs/seg]">
            11377
         </td>
         <td data-label="Nota">
            Desempenho semelhante ao java.util.Random aponta que a execução já é local da thread no grupo de threads (sem execução explícita no pool de threads dentro do script)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizador">
            org.apache.commons.lang3.RandomUtils
         </td>
         <td data-label="Taxa de transferência [execs/seg]">
            <span class="color-ok">11704</span>
         </td>
         <td data-label="Nota">
            O mais rápido por uma margem muito pequena (1%)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizador">
            <a href="https://jmeter.apache.org/usermanual/functions.html#__Random">__Random</a>
         </td>
         <td data-label="Taxa de transferência [execs/seg]">
            <span class="err">5065</span>
         </td>
         <td data-label="Nota">
            Duas vezes mais lento
         </td>
      </tr>
    </tbody>
</table>

Como você pode ver, qualquer um dos três primeiros métodos é uma escolha válida. Eu não recomendaria o uso de *__Random*, pois parece de alguma forma muito lento. No entanto, existem outras funções bastante úteis como [__RandomString](https://jmeter.apache.org/usermanual/functions.html#__RandomString), [__RandomDate](https://jmeter.apache.org/usermanual/functions.html#__RandomDate), [__time](https://jmeter.apache.org/usermanual/functions.html#__time), [](https://jmeter.apache.org/usermanual/functions.html#__UUID) e [__threadNum](https://jmeter.apache.org/usermanual/functions.html#__threadNum) para gerar dados fictícios. O código Groovy também pode ser embutido usando [__groovy](https://jmeter.apache.org/usermanual/functions.html#__groovy).

### Aumentando a carga

Ao parametrizar a carga e a quantidade de requisições por segundo desejada, você pode querer anotar algumas propriedades de configuração dos seus componentes em teste. No caso do banco de dados, é o número máximo de conexões. Para os servidores, é o número de requisições paralelas e o tamanho da fila. Multiplique isso pelo número de nós e considere alguma sobrecarga.

Como mencionado antes, aumentar a carga é tão simples quanto aumentar o número de usuários. Dependendo da especificação da sua máquina e da implementação do teste, você será capaz de configurar cerca de 5000 threads paralelas. No entanto, em algum ponto, a sobrecarga de criar threads adicionais diminuirá efetivamente o desempenho, possivelmente até congelando a máquina que executa o teste. Se você tem um sistema de alto desempenho com vários nós, pode não ser suficiente para atingir o limite máximo de carga. Note que também é difícil estimar o número de execuções de interface por unidade de tempo, com base no número de usuários. Por padrão, cada thread tem que enviar uma requisição para a interface e esperar por uma resposta.

<img class="uml-bg" src="/img/hq/load-tests-client-server-client.svg" alt="Comunicação padrão cliente-servidor" title="Comunicação padrão cliente-servidor">

Ao definir um timeout de resposta, podemos efetivamente pular a espera por uma resposta e iniciar a próxima requisição mais rápido. A falha disso é que você perderá a possibilidade de monitorar as respostas e seus status. É uma opção válida se você tiver outras ferramentas para monitorar a carga. Ao definir um timeout de resposta realmente baixo, recomendo também deixar um grupo de threads não configurado para uma verificação de status. Você pode ser bloqueado por algum firewall desconhecido e não perceber, especialmente se as ferramentas de monitoramento não exibirem dados online.

<img class="uml-bg" src="/img/hq/load-tests-client-server.svg" alt="Comunicação cliente-servidor com timeout de resposta rápido" title="Comunicação cliente-servidor com timeout de resposta rápido">

A última coisa a considerar é a conexão. Na rede local, você geralmente terá tempos muito baixos para alcançar o servidor. Se o ambiente de destino estiver na internet ou for acessível apenas através de VPN, os testes serão mais lentos, gerando cargas menores. Finalmente, não se esqueça da largura de banda, que muitas vezes é o fator limitante.

### Resumo

JMeter é uma ferramenta interessante para testes de carga, no entanto, deve ser combinada com ferramentas de monitoramento adicionais. Há muitas coisas a considerar para tornar os testes significativos. Cada questão deve ser reconhecida durante a preparação. Após uma execução de teste bem-sucedida, é hora de analisar e preparar os relatórios. É uma parte essencial na definição de passos futuros para atender ou definir o SLA.

Não se esqueça de conferir o projeto de exemplo. Você pode brincar com os testes descobrindo os números padrão para o pool de threads do Tomcat, tamanho da fila, tamanho do pool de conexões do banco de dados H2 e valores de timeout. Tópicos como carregar dados de CSV/banco de dados, escopo de variáveis e aumento de carga também são abordados lá.
