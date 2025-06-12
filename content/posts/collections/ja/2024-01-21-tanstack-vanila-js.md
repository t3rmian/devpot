---
title: TanStack Table 8とバニラJSを使ってみよう
url: tanstack-table-バニラ-js
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

最近、TanStack TableというミニマルでヘッドレスなJSテーブルライブラリに出会いました。
特に、他の多機能で自己主張の強いソリューションを扱った後だったので、とても新鮮に感じました。
TanStack Table 8は、ReactJS、Svelte、Vueなどの最も人気のあるWeb UI構築ライブラリと、
別のモジュールを通じてうまく統合できます。そしてドキュメントによれば、バニラJSを使っても
他のライブラリと同様に利用できるとのことです。

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="TanStack Tableデモ" alt="TanStack Tableデモ">

現在、他のアプローチとは異なり、バニラJSでの使用例は提供されていません。
良い出発点は、選択したフレームワーク内のサンプルプロジェクトと、統合モジュールの簡単な実装を調べることです。
それを踏まえて、皆さんのためにTanStack TableのバニラJSデモを用意しました。

## TanStack Table 8とバニラJS

まず最初に、一般的な[入門ガイド](https://tanstack.com/table/v8/docs/guide/tables)をご覧ください。
そこにはテーブルモデルを構築するために必要なステップが説明されています。
始めるには、コアライブラリ`@tanstack/table-core@8.11.6`を
依存関係に追加します。簡単にするために、ここでは
`unpkg.com`サービスを使ってページに読み込みます。これにより、
環境設定の手間が省けます。

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

次のステップは、テーブルを配置する場所をHTMLのbodyに用意することです。

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

次に、ダミーデータを準備しましょう。
キーと値のプロパティからなるオブジェクトのJSON配列でかまいません。

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

テーブルモデルの作成に移ります。
データに加えて、カラム定義を作成する必要があります。
これらは特定の構造を持つべきで、`createColumnHelper()`と`accessor()`ユーティリティを使って
それに従うことができます。
インポートされたUMDモジュールを振り返ると、それは`TableCore`というグローバル変数名でエクスポートされています。

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

これらのアクセサは、テーブルコンテンツの周りに基本的なテンプレートを提供するクリーンな方法を提供します。
後でパラメータをいじって、どのように機能するかを確認してみてください。
最後に、テーブルモデルを構築できます。いくつかのプロパティが必須と見なされていたため、
何度か試行錯誤が必要でした。

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

TanStack Tableはヘッドレス実装なので、
自分でDOMを構築する必要があります。バニラJSでのDOM作成は少々面倒ですが、それほど難しいわけではありません。
テーブルモデルから、ヘッダー、行、フッターの情報を取得できます。
これらを`createElement`と`element.innerHTML` DOM APIから作成した
テーブル要素にマッピングできます。

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

最後に、ルート要素をテーブル要素で置き換えます。
ヘッドレスな性質のおかげで、テーブル要素をまったく使用する必要はありません。カスタムのテーブル構造を作成できます。
`flexRender`を通じて、他のUIフレームワークと[テンプレートを統合](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx)することもできます。

## おまけのショーケース – ソート

単純なモデルの作成方法と、それがDOMとどう関係するかがわかったので、ドキュメントでより高度なオプションを調べることができます。
もう1つ、非常に重要な学習ステップがあります。モデルの状態が変わるたびに、テーブルを再描画する必要があります。
これをどう行うかを見つけ出すには時間がかかるかもしれないので、ソートのショーケースを通じてその方法をお見せします。

ソート機能を追加するには、モデル設定に追加のオプションを含める必要があります。
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

ソートは、列ヘッダーの`getToggleSortingHandler()`関数から返されるハンドラを呼び出すことで有効化および切り替えができます。
`drawTable`関数内で、ヘッダーセル要素の`onclick`関数にバインドできます。

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

最後に、ソートの変更時にテーブルを再描画する必要があります。さもないと、視覚的に何も変わりません。
最善の方法は、`onStateChange`のようなテーブルの状態変更に関するグローバルリスナーを介することです。
しかし、このテーブルオプションは設定が厄介です。なぜなら、そうするとコアの状態セッターがアンバインドされてしまうからです。
幸いなことに、これは意図されたものであり、ドキュメントを調べた後、再帰をトリガーしない`table.setOptions`でバインドし直します。

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

最終的なテーブルデモは次のようになり、動作するはずです。

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>


