---
title: Primeros pasos con TanStack Table 8 y vanilla JS
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

Recientemente me topé con una librería JS minimalista y headless para tablas llamada TanStack Table. Fue un soplo de aire fresco, sobre todo tras trabajar con otras soluciones mucho más opinadas. TanStack Table 8 se integra muy bien con las principales librerías de UI web como ReactJS, Svelte o Vue mediante módulos separados, y la documentación asegura que también es usable con vanilla JS.

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="TanStack Table Demo" alt="TanStack Table Demo">

Actualmente no hay ejemplos para vanilla JS, a diferencia de otros enfoques. Un buen punto de partida es examinar un proyecto de ejemplo en el framework elegido y una breve implementación del módulo de integración. Tras hacerlo, preparé una demo de TanStack Table con vanilla JS para ti.

## TanStack Table 8 con vanilla JS

Primero, revisa la [guía de inicio](https://tanstack.com/table/v8/docs/guide/tables). Explica los pasos para construir el modelo de tabla. Para empezar, añade la librería core `@tanstack/table-core@8.11.6` a tus dependencias. Por simplicidad, usaré `unpkg.com` para cargarla en la página, así no tengo que montar ningún entorno.

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

El siguiente paso es preparar un espacio en el body HTML donde pondremos la tabla:

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

Ahora, prepara algunos datos de prueba. Puede ser un array JSON de objetos con propiedades clave-valor:

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

Vamos a crear el modelo de tabla. Además de los datos, hay que definir las columnas. Deben tener una estructura específica, que podemos seguir usando `createColumnHelper()` y `accessor()`. En el módulo UMD importado, se exporta bajo la variable global `TableCore`.

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

Estos accessors permiten poner plantillas básicas alrededor del contenido de la tabla. Prueba a modificar los parámetros para ver cómo funcionan. Por último, construimos el modelo de tabla. Me costó un par de intentos porque algunas propiedades son obligatorias:

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

Como TanStack Table es headless, tienes que construir el DOM tú mismo. Vanilla JS es algo tedioso para crear DOM, pero no es difícil. Del modelo puedes sacar headers, filas y footers y mapearlos a elementos creados con `createElement` y `element.innerHTML`:

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
        // si el contenido es inseguro, puedes sanearlo aquí
        if (typeof renderer === "function") {
            return renderer(context);
        }
        return renderer
    }
}
```

Al final, reemplaza el root por la tabla. Gracias a que es headless, no tienes que usar elementos table si no quieres. Puedes crear estructuras personalizadas. Con `flexRender` también puedes [integrar plantillas](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx) con otros frameworks.

## Bonus: ordenación

Ahora que sabemos crear un modelo simple y cómo se relaciona con el DOM, podemos mirar opciones avanzadas en la documentación. Hay un paso más importante: cada vez que cambie el estado del modelo, hay que redibujar la tabla. Descubrir cómo hacerlo puede llevar tiempo, así que te muestro cómo hacerlo con un ejemplo de ordenación.

Para añadir ordenación, necesitas incluir una opción extra en la configuración del modelo:
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

La ordenación se activa y alterna llamando al handler de `getToggleSortingHandler()` del header de columna. Dentro de `drawTable`, puedes enlazarlo al `onclick` del th.

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

Por último, hay que redibujar la tabla al cambiar el orden, si no, no verás cambios. Lo ideal sería con un listener global al cambio de estado, como `onStateChange`. Sin embargo, esta opción es delicada porque al configurarla desvinculas el setter core del estado. Por suerte, esto es intencionado y, tras mirar la documentación, lo reenganchamos con `table.setOptions`, que no provoca recursión.

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

La demo final de la tabla debería verse y funcionar así:

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>

