---
title: JMeter — introdução
url: jmeter-introducao
id: 4
category:
- testing: Testes
tags:
- jmeter
author: Damian Terlecki
date: 2019-06-02T20:00:00
---

JMeter é uma ferramenta Java de código aberto que é frequentemente usada para testes de desempenho para determinar o comportamento do sistema sob situações de carga pesada. Embora este seja o principal propósito do JMeter, ele pode, na verdade, ser utilizado para executar a maioria dos testes de sistema, como:
- testes de funcionalidade;
- testes de desempenho;
- testes de carga e estabilidade;
- testes de escalabilidade;
- testes de regressão.

<img class="uml-bg" src="/img/hq/system-testing.png" alt="Fases de teste" title="Níveis de teste">

O teste de sistema é feito após os testes de unidade e integração, mas antes dos testes de aceitação. Geralmente, é a última etapa realizada pela equipe de desenvolvimento/teste. Você poderia argumentar que não precisa de uma ferramenta extra para testes de sistema — e isso pode ser verdade no seu caso. Você poderia simplesmente escrever alguns testes durante o desenvolvimento no nível de integração com módulos totalmente integrados — e isso também pode funcionar. No entanto, há muitos casos em que seria difícil verificar todos os requisitos sem alguns truques.

É aqui que o JMeter brilha — você obtém uma ferramenta especialmente preparada para esses tipos de testes. Em primeiro lugar, você pode configurar facilmente o número desejado de usuários (threads) para seus testes. Para fazer isso, clique em *Plano de Teste* com o botão direito do mouse e escolha a opção na lista *Adicionar*. Se precisar de mais — você também pode definir atrasos de inicialização, períodos de aceleração (ramp-up) e escolher o que fazer quando um amostrador (semelhante a um único teste) falhar. Para cada thread, vários amostradores podem ser escolhidos:
- **Amostrador HTTP — imita um usuário visitando um site, testa serviços web REST ou SOAP;**
- **Amostrador JDBC — conecta-se a um banco de dados para verificar os dados ou executar consultas DML (requer o elemento *Configuração de Conexão JDBC*);**
- Amostrador JSR223 — usa scripts (Groovy/BeanShell/JavaScript/…) para a Plataforma Java;
- Amostradores SMTP e Leitor de E-mail — testa o servidor SMTP ou verifica se o e-mail foi entregue;
- Amostradores JMS;
- Amostrador TCP;
- Requisição FTP;
- Requisição JUnit;
- …

Para cada amostrador, você pode adicionar (botão direito do mouse->*Adicionar*) vários tipos de asserções que podem verificar os dados:
- Asserção de Resposta — verificação padrão da resposta (cabeçalhos/corpo/status) com capacidades de RegEx;
- Asserção JSON — verifica os dados da resposta JSON usando JSON Path e RegEx opcional;
- Asserção JSR223 — usa linguagem de script para verificação;
- Asserção XPath — semelhante ao JSON Path, mas para XML;
- …

Pequenos casos de teste devem utilizar as Asserções da GUI. Para problemas mais complexos, se você for um desenvolvedor, provavelmente será mais eficiente com a *Asserção JSR223* (além da falta de jeito do JMeter e das opções de depuração limitadas). Caso contrário, sugiro reestruturar os planos de teste com *Controladores Lógicos* (if/while/for) e *Pós-Processadores* (extratores). *Pré* e *Pós-Processadores* podem ser usados para um amostrador selecionado para executar a lógica antes e depois da execução do amostrador.

As coisas restantes que estão no JMeter prontas para uso são *Temporizadores, Elementos de Configuração e Ouvintes*. Os primeiros fornecem uma maneira fácil de gerenciar o tempo — parar threads, pausá-las para agrupamento ou atrasá-las para atingir a taxa de transferência esperada. Os elementos de configuração podem ser usados para definir parâmetros, contadores, padrões para requisições e configurações de conexão. Os ouvintes fornecem uma maneira de visualizar os resultados do teste.

Finalmente, algumas coisas que você provavelmente mais usará enquanto desenvolve os testes são:
- Amostradores de Depuração e Pós-Processadores de Depuração — fornecem logs de entrada e saída do amostrador, juntamente com os valores das variáveis;
- Visualizador de Árvore de Resultados (*Ouvinte*) — para ver os resultados dos testes, juntamente com os logs;
- Relatório de Sumário ou Agregado (*Ouvintes*) — saída de estatísticas do teste de desempenho;
- Parâmetros do Usuário (*Pré-Processador*) ou Variáveis Definidas pelo Usuário (*Elemento de Configuração*) — para definir parâmetros (use a sintaxe `${nome_parametro}` para obter o valor do parâmetro) ou variáveis.

Além de tudo isso, se você realmente precisar de alguns recursos mais avançados, pode instalar [inúmeros plugins personalizados](https://jmeter-plugins.org/) ou [escrever o seu próprio](https://jmeter.apache.org/usermanual/jmeter_tutorial.html). Os testes do JMeter podem ser executados manualmente ou configurados para serem executados em sua ferramenta de CI/automação e direcionados a múltiplos ambientes. Essa abordagem fornece uma maneira ligeiramente diferente e, às vezes, muito útil de verificar a consistência do seu sistema em diferentes versões ou sob diferentes configurações.
