---
title: Getting Started with TanStack Table 8 and vanilla JS 
url: tabstack-table-vanilla-js
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

Recently, I stumbled upon a minimalistic, headless JS table library called TanStack Table.
It was a breath of fresh air, especially after working with other full-blown opinionated solutions.
TanStack Table 8 integrates nicely with the most popular web UI building libraries
like ReactJS, Svelte, or Vue through separate modules, and the documentation assures its usability
with others through vanilla JS.

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="TanStack Table Demo" alt="TanStack Table Demo">

Currently, there are no samples for vanilla JS use, unlike for
other approaches. A good starting point is to examine a sample project within the selected framework,
along with a brief implementation of the integration module.
Having done that, I prepared a TanStack Table vanilla JS demo for you.

## TanStack Table 8 with vanilla JS

First things first, please take a look at the general [getting started guide](https://tanstack.com/table/v8/docs/guide/tables).
It explains what steps are necessary to build the table model.
To get started, add the core `@tanstack/table-core@8.11.6` library
to your dependencies. For the sake of simplicity, I'll use
`unpkg.com` service to load it into the page, which relieves
me from setting up any environment.

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

Next step is to prepare some space in the HTML body
where we will place our table:

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

Now, let's prepare some dummy data.
It can be a JSON array of objects consisting of key-value properties: 

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

Onto creating the table model. 
Besides the data, we have to create some column definitions.
They ought to have a specific structure to which we can adhere
by using the `createColumnHelper()` and `accessor()` utilities.
Looking back into the imported UMD module, it is being exported under the global variable named `TableCore`.

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

These accessors offer a clean way to provide some basic templates around the table content.
Fiddle with the parameters later on to see how they work.
Finally, we can build the table model. It took me a few trials and
errors as some properties were deemed to be mandatory:

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

Since TanStack Table is a headless implementation,
you have to build the DOM yourself. Vanilla JS is a bit cumbersome at DOM creation, but not that hard.
From the table model you can retrieve the headers, rows and footer information.
You can map them to table elements created
from `createElement` and `element.innerHTML` DOM API.

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

At the end, replace the root element with the table element.
Thanks to the headless nature, you don't have to use the table elements at all. You can create custom table structures.
Through the `flexRender`, you can also [integrate templating](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx) with other UI frameworks.

## Bonus showcase – sorting

Now that we know how to create a simple model and how it relates to the DOM, we can look up more advanced options in the documentation.
There is one more, quite important, learning step to be made. Every time our model state changes, we ought to redraw the table.
Figuring out how to do this can take some time, so I'll show you how to do this through a sorting showcase.

To add the sort feature, you need to include additional option in the model configuration:
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

Sorting can be enabled and toggled by invoking the handler returned from the `getToggleSortingHandler()` function of the column header.
Within the `drawTable` function, you can bind it to the header cell element's `onclick` function.

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

Finally, we need to redraw the table on the sorting change – otherwise, nothing will change visually.
The best way would be through some global listener on the table state change like `onStateChange`.
However, this table option is tricky to configure because doing so unbinds the core state setter.
Fortunately, this is intended, and after looking up the documentation, we bind it back with `table.setOptions` that does not trigger a recursion. 

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

The final table demo should look and work like this:

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>

