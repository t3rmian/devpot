---
title: Primeiros Passos com TanStack Table 8 e JavaScript puro
url: tabela-tanstack-javascript-puro
id: 123
category:
- javascript: JS
tags:
- tanstack
- html
author: Damian Terlecki
date: 2024-01-21T20:00:00
source: https://gist.github.com/t3rmian/938510d4a6c1f9317e2d7d15e0a4c40d
---

Recentemente, me deparei com uma biblioteca de tabelas JS minimalista e headless chamada TanStack Table.
Foi um sopro de ar fresco, especialmente depois de trabalhar com outras soluções completas e opinativas.
A TanStack Table 8 se integra muito bem com as bibliotecas de construção de UI web mais populares
como ReactJS, Svelte ou Vue através de módulos separados, e a documentação garante sua usabilidade
com outras tecnologias através de JavaScript puro (vanilla JS).

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="Demonstração da TanStack Table" alt="Demonstração da TanStack Table">

Atualmente, não há exemplos de uso com JavaScript puro, ao contrário de
outras abordagens. Um bom ponto de partida é examinar um projeto de exemplo no framework escolhido,
juntamente com uma breve implementação do módulo de integração.
Feito isso, preparei para você uma demonstração do TanStack Table com JavaScript puro.

## TanStack Table 8 com JavaScript puro

Primeiramente, dê uma olhada no [guia geral de introdução](https://tanstack.com/table/v8/docs/guide/tables).
Ele explica quais passos são necessários para construir o modelo da tabela.
Para começar, adicione a biblioteca principal `@tanstack/table-core@8.11.6`
às suas dependências. Para simplificar, usarei
o serviço `unpkg.com` para carregá-la na página, o que me livra
de configurar qualquer ambiente.

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

O próximo passo é preparar um espaço no corpo do HTML
onde colocaremos nossa tabela:

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

Agora, vamos preparar alguns dados de exemplo.
Pode ser um array JSON de objetos compostos por propriedades de chave-valor:

```html
<script>
const data = [
    {
        fullName: "Alice Johnson",
        position: "Software Engineer",
        department: "Engineering",
        yearsOfService: 3
    },
    {
        fullName: "Bob Smith",
        position: "Marketing Specialist",
        department: "Marketing",
        yearsOfService: 7
    },//...
];//...
</script>
```

Agora, vamos criar o modelo da tabela.
Além dos dados, temos que criar algumas definições de coluna.
Elas devem ter uma estrutura específica à qual podemos aderir
usando os utilitários `createColumnHelper()` e `accessor()`.
Olhando para o módulo UMD importado, ele é exportado sob a variável global chamada `TableCore`.

```js
const columnHelper = TableCore.createColumnHelper();
const columns = [
    columnHelper.accessor(row => row.fullName, {
        id: 'fullName',
        cell: info => info.getValue(),
        footer: info => info.column.id,
    }),
    columnHelper.accessor(row => row.position, {
        id: 'position',
        cell: info => `<i>${info.getValue()}</i>`,
        header: () => `<span>Position</span>`,
        footer: info => info.column.id,
    }),//...
];
```

Esses "accessors" oferecem uma forma limpa de fornecer alguns templates básicos para o conteúdo da tabela.
Brinque com os parâmetros mais tarde para ver como eles funcionam.
Finalmente, podemos construir o modelo da tabela. Levei algumas tentativas e
erros, já que algumas propriedades eram obrigatórias:

```js
const table = TableCore.createTable({
    data,
    columns,
    getCoreRowModel: TableCore.getCoreRowModel(),
    state: {
        columnPinning: {},
        pagination: {},
    },
    debugAll: true,
});
```

Como o TanStack Table é uma implementação headless,
você mesmo precisa construir o DOM. JavaScript puro é um pouco trabalhoso para a criação do DOM, mas não é tão difícil.
Do modelo da tabela, você pode recuperar as informações de cabeçalhos, linhas e rodapé.
Você pode mapeá-los para elementos de tabela criados
a partir da API do DOM com `createElement` e `element.innerHTML`.

```js
drawTable("table-root", table);

function drawTable(rootElementId, tableModel) {
    const rootElement = document.getElementById(rootElementId);
    const tableElement = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const tfoot = document.createElement("tfoot");

    thead.append(...tableModel.getHeaderGroups().map(headerGroup => {
        const rowElement = document.createElement("tr");
        rowElement.append(...headerGroup.headers.map(header => {
            const cellElement = document.createElement("th");
            cellElement.innerHTML = flexRender(header.column.columnDef.header, header.getContext());
            return cellElement;
        }));
        return rowElement;
    }));
    // 

    tbody.append(...tableModel.getRowModel().rows.map(row => {
        const rowElement = document.createElement("tr");
        rowElement.append(...row.getVisibleCells().map(cell => {
            const cellElement = document.createElement("td");
            cellElement.innerHTML = flexRender(cell.column.columnDef.cell, cell.getContext());
            return cellElement;
        }));
        return rowElement;
    }));

    tfoot.append(...tableModel.getFooterGroups().map(footerGroup => {
        const rowElement = document.createElement("tr");
        rowElement.append(...footerGroup.headers.map(header => {
            const cellElement = document.createElement("th");
            cellElement.innerHTML = flexRender(header.column.columnDef.footer, header.getContext());
            return cellElement;
        }));
        return rowElement;
    }));
    tableElement.append(thead, tbody, tfoot);
    tableElement.id = rootElementId;
    rootElement.replaceWith(tableElement);

    function flexRender(renderer, context) {
        // if the content is unsafe, you can sanitize it here
        if (typeof renderer === "function") {
            return renderer(context);
        }
        return renderer
    }
}
```

No final, substitua o elemento raiz pelo elemento da tabela.
Graças à natureza headless, você não precisa usar elementos de tabela. Você pode criar estruturas de tabela personalizadas.
Através do `flexRender`, você também pode [integrar templates](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx) com outros frameworks de UI.

## Demonstração bônus – ordenação

Agora que sabemos como criar um modelo simples e como ele se relaciona com o DOM, podemos procurar por opções mais avançadas na documentação.
Há mais um passo de aprendizado bastante importante a ser feito. Toda vez que o estado do nosso modelo muda, devemos redesenhar a tabela.
Descobrir como fazer isso pode levar algum tempo, então vou mostrar como fazer através de uma demonstração de ordenação.

Para adicionar a funcionalidade de ordenação, você precisa incluir uma opção adicional na configuração do modelo:
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

A ordenação pode ser ativada e alternada invocando o manipulador retornado da função `getToggleSortingHandler()` do cabeçalho da coluna.
Dentro da função `drawTable`, você pode vinculá-lo à função `onclick` do elemento da célula do cabeçalho.

```js
thead.append(...tableModel.getHeaderGroups().map(headerGroup => {
    const rowElement = document.createElement("tr");
    rowElement.append(...headerGroup.headers.map(header => {
        const cellElement = document.createElement("th");
        cellElement.innerHTML = flexRender(header.column.columnDef.header, header.getContext());
        cellElement.onclick = header.column.getToggleSortingHandler()
        if (header.column.getIsSorted()) {
            cellElement.innerHTML += header.column.getIsSorted() === 'asc' ? '↑' : '↓'
        }
        return cellElement;
    }));
    return rowElement;
}));
```

Finalmente, precisamos redesenhar a tabela na mudança de ordenação – caso contrário, nada mudará visualmente.
A melhor maneira seria através de algum listener global na mudança de estado da tabela, como `onStateChange`.
No entanto, essa opção da tabela é um pouco complicada de configurar, pois ao fazê-lo, o setter de estado principal é desvinculado.
Felizmente, isso é intencional e, após consultar a documentação, nós o vinculamos de volta com `table.setOptions`, que não dispara uma recursão.

```js
const table = TableCore.createTable({
    //...
    onStateChange: (foo) => {
        table.setOptions(prev => ({
            ...prev,
            state: foo(table.getState())
        }));
        drawTable("table-root", table)
    }
});
```

A demonstração final da tabela deve ter a aparência e funcionar assim:

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>


