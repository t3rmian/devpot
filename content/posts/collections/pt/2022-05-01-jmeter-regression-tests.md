---
title: Teste de regressão simples de web service com JMeter
url: jmeter-teste-de-regressao-web-service
id: 85
category:
- testing: Testes
tags:
- jmeter
- web-services
author: Damian Terlecki
date: 2022-05-01T20:00:00
source: https://gist.github.com/t3rmian/293a8933ed0952cb47e22328a5c3ffc0
---

O JMeter vem com muitos amostradores (samplers) poderosos que nos permitem escrever um plano de teste e executá-lo em diferentes ambientes.
Obter os dados de entrada, que podem variar entre os ambientes, diretamente do banco de dados simplifica muito a preparação dos casos de teste.

Com a falta de um IntelliSense, levará algum tempo para se tornar fluente no JMeter. No entanto, você pode criar um teste bastante simples
que, em muitos casos, trará muito valor. Vou mostrar como preparar um teste que detectará regressões
nos endpoints de leitura de um web service.

<img src="/img/hq/jmeter-regression-tests/jmeter-regression-test.png" alt="Plano de Teste do JMeter" title="Plano de Teste do JMeter">

### Regressão em API versionada

Na sua forma mais simples, você pode procurar por uma regressão comparando as respostas do web service para o mesmo ID de recurso.
Para isso, você precisará de alguns dados de entrada. Na maioria das vezes, você fornecerá esses dados através das variáveis de usuário no Plano de Teste, do elemento de configuração de arquivo CSV ou de um amostrador JDBC/HTTP.

<figure class="flex">
<img src="/img/hq/jmeter-regression-tests/jmeter-test-plan.png" alt="Variáveis de Usuário do JMeter" title="Variáveis de Usuário do JMeter">
<img src="/img/hq/jmeter-regression-tests/jmeter-jdbc-sampler.png" alt="Amostrador JDBC do JMeter" title="Amostrador JDBC do JMeter">
</figure>

Com os dados de entrada, basta adicionar o controlador ForEach e dois amostradores HTTP para ambas as versões do endpoint da API.
Sob o primeiro amostrador, adiciono uma Asserção de Resposta que desativa a verificação de status. Isso me permite ignorar o
status da resposta e, posteriormente, confiar em minhas próprias asserções. Com um Extrator de Expressão Regular, extraio os dados da resposta para uma variável.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-foreach-controller.png" alt="Controlador ForEach do JMeter" title="Controlador ForEach do JMeter">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regex.png" alt="Extrator de Expressão Regular do JMeter" title="Extrator de Expressão Regular do JMeter">
</figure>

Sob o segundo amostrador, reutilizo uma Asserção de Resposta e comparo a segunda resposta com a variável do primeiro amostrador.
Isso me ajuda a detectar quaisquer alterações nas respostas entre duas versões do mesmo endpoint. No Visualizador de Árvore de Resultados, posso verificar rapidamente as asserções que falharam.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-response-assertion.png" alt="Asserção de Resposta do JMeter" title="Asserção de Resposta do JMeter">

Nem todas as diferenças são regressões. Este teste é válido para otimizações de desempenho. Para alterações funcionais, você pode querer fazer alguns ajustes para atender aos seus requisitos. Verifique o código de resposta em vez dos dados, altere o escopo do REGEX ou use o Extrator de JSON para comparar partes relevantes da resposta.

### Regressão em uma API não versionada

Outra abordagem que você pode usar é comparar os resultados do amostrador salvos em um arquivo. Isso é especialmente útil quando:
- você tem uma API não versionada;
- suas alterações são implantadas por trás de alguma flag interna;
- você simplesmente quer detectar regressões, apesar de não haver alterações externas no endpoint.

O plano de teste para isso é bem simples se você não precisar pós-processar a resposta. Use o Visualizador de Árvore de Resultados para salvar os resultados iniciais no arquivo.
Em seguida, invoque-o novamente após uma implantação ou ao alternar a flag e compare os dois arquivos.

Se você quiser alcançar a mesma lógica de extração, use um simples amostrador JSR223. No script, exiba a resposta extraída através da linha `vars["responseV1"]`, e adicione um Visualizador de Árvore de Resultados sob este amostrador.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-save-results-tree.png" alt="Visualizador de Árvore de Resultados do JMeter" title="Visualizador de Árvore de Resultados do JMeter">

Para comparar os conteúdos, execute os grupos de threads consecutivamente (no nível do Plano de Teste) para que o arquivo seja salvo em um grupo de threads e verificado em outro.
Executar a comparação é tão fácil quanto usar o comando `diff` do Amostrador de Processo do SO em ambos os arquivos. Com esta opção, não se esqueça de configurar o código de retorno esperado.
Caso contrário, uma rota independente do SO inclui qualquer outro amostrador (por exemplo, um Amostrador de Depuração) com:
- dois pré-processadores de Parâmetros de Usuário extraindo o conteúdo do arquivo para uma variável: `${__FileToString(testResults1.xml)}`;
- a Asserção de Resposta que compara ambas as variáveis.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-os-process-sampler.png" alt="Amostrador de Processo do SO do JMeter" title="Amostrador de Processo do SO do JMeter">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-user-parameters.png" alt="Parâmetros de Usuário do JMeter" title="Parâmetros de Usuário do JMeter">
</figure>

O plano descrito foi executado no JMeter 5.4.3 com respostas simuladas pelo `jwebserver` do Java 18.
Você encontrará os arquivos de origem relevantes na parte inferior da página.
Sinta-se à vontade para usá-los como ponto de partida para seus próprios testes de regressão.
