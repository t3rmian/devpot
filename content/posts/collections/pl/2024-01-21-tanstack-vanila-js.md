---
title: Pierwsze kroki z TanStack Table 8 przy wykorzystaniu czystego JS
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

Dosyć niedawno natknąłem się na minimalistyczną (*headless*) bibliotekę do budowania tabel JS o nazwie TanStack Table. Był to dla mnie swego rodzaju powiew świeżego
powietrza, zwłaszcza po doświadczeniach z innymi rozwiązaniami dostarczającymi gotowe elementy interfejsu tabel użytkownika. TanStack Table 8 dobrze
integruje się z najpopularniejszymi bibliotekami do tworzenia elementów stron, takimi jak ReactJS, Svelte lub Vue,
poprzez oddzielne moduły. Dokumentacja wspomina również o możliwości integracji z innymi rozwiązaniami w tym przy użyciu podstawowego JavaScriptu.

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="Demo TanStack Table" alt="Demo TanStack Table">

Obecnie nie znajdziesz przykładów tworzenia tabelek w standardowym JSie, w przeciwieństwie do
przykładów z wykorzeystaniem innych frameworków. Dobrym punktem wyjściowym jest zbadanie przykładu z wybranego frameworku,
wraz z krótką implementacją modułu integracyjnego.
Tak też zrobiłem, przygotowując demo bez wykorzystania zewnętrznych bibliotek.

## TanStack Table 8 i czysty JS

Na początek polecam zapoznać się z oficjalnym [przewodnikiem wprowadzającym](https://tanstack.com/table/v8/docs/guide/tables).
Wyjaśnia, jakie kroki są niezbędne do zbudowania modelu tabeli, ale bez zagłębiania się w szczegóły. Aby rozpocząć, dodaj podstawową
bibliotekę `@tanstack/table-core@8.11.6` do swoich zależności. Dla uproszczenia użyję usługi `unpkg.com`, aby załadować
go na stronę, w ten sposób przygotowanie środowiska ograniczę do wykorzystania przeglądarki.

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

Następnym krokiem jest przygotowanie miejsca w strukturze HTML, w którym umieścimy naszą tabelę:

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

Przygotujmy teraz przykładowe dane do wyświetlenia.
Może to być tablica obiektów JSON składająca się z właściwości klucz-wartość:

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

Przejdźmy do stworzenia modelu tabeli. Oprócz danych musimy utworzyć definicje kolumn. Powinny mieć określoną
strukturę. Zbudujemy ją, korzystając z funkcji pomocniczych `createColumnHelper()` i `accessor()`. Patrząc na
zaimportowany wcześniej moduł UMD, jego funkcje eksportowane są w kontekście zmiennej globalnej o nazwie `TableCore`.

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

Te tzw. akcesory oferują czytelny sposób definiowania podstawowych szablonów treści tabeli. Polecam Ci pobawić się
później parametrami, żeby zobaczyć, jak działają. Dalej możemy zbudować model tabeli. Zajęło mi to kilka prób,
ponieważ niektóre właściwości stanu okazały się obligatoryjne:

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

Ponieważ TanStack Table jest implementacją typu *headless*, interfejs użytkownika musisz zbudować i podpiąć na własną rękę.
Podstawowy JS jest nieco nieporęczny do tworzenia i aktualizacji DOM, ale nie jest to aż tak trudne.
Z modelu tabeli możesz pobrać informacje o nagłówkach, wierszach i stopce. Dane te
zmapujesz na poszczególne elementy tabeli, tworząc je przy pomoci API DOM `createElement` i `element.innerHTML`.

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

Na koniec wskazany element HTML podmieniamy elementem reprezentującym naszą tabelę. Dzięki tej charakterystycznej operacji nie
jesteśmy ograniczani do korzystania ze standardowych znaczników tabeli. Możesz tworzyć struktury niestandardowe. W miejscu funkcji `flexRender` możesz
także [zintegrować budowanie interfejsu](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx) z innymi frameworkami.

## Bonus – sortowanie

Teraz gdy wiesz, jak stworzyć prosty model i jak ma się on do drzewa DOM, możesz poszukać w dokumentacji bardziej
zaawansowanych funkcjonalności. Przed tym warto zrozumieć jeszcze jedną ważną operację. Za każdym razem, gdy zmienia się stan
naszego modelu, powinniśmy odświeżyć tabelę. Zobaczmy jak to zrobić, podpinając możliwość sortowania.

W celu dodania funkcji sortowania musimy uwzględnić w konfiguracji dodatkową opcję definiującą zachowanie modelu:
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

Sortowanie modelu można włączyć i przełączać wywołując *handler* zwrócony przez funkcję `getToggleSortingHandler()` nagłówka kolumny.
W ramach funkcji `drawTable` możesz powiązać go z funkcją `onclick` elementu komórki nagłówka.

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

Na koniec musimy odświeżyć wyświetlaną tabelę przy zmianie sortowania – w przeciwnym razie wizualnie nic się nie zmieni.
Najlepszym sposobem byłoby podpięcie tworzenia elementów tabeli do zmiany jej stanu, np. poprzez opcję konfiguracyjną `onStateChange`.
Skonfigurowanie tej opcji tabeli powoduje jednak nieoczekiwane skutki, tj. brak aktualizacji stanu modelu.
Na szczęście jest to zamierzone i po przejrzeniu dokumentacji dowiadujemy się, że można go zaktualizować za pomocą funkcji `table.setOptions`,
która nie prowadzi do rekursji.

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

Finalnie nasza tabelka prezentuje się następująco:

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>

