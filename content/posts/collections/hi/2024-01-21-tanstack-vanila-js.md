---
title: TanStack Table 8 और वैनिला JS के साथ शुरुआत
url: टैनस्टैक-टेबल-वैनिला-जेएस
id: 123
category:
- javascript: जावास्क्रिप्ट
tags:
- टैनस्टैक
- एचटीएमएल
author: Damian Terlecki
date: 2024-01-21T20:00:00
source: https://gist.github.com/t3rmian/938510d4a6c1f9317e2d7d15e0a4c40d
---

हाल ही में, मैं एक न्यूनतम, हेडलेस JS टेबल लाइब्रेरी पर ठोकर खाई जिसका नाम TanStack Table है।
यह एक ताजी हवा का झोंका था, खासकर अन्य पूर्ण-विकसित राय वाले समाधानों के साथ काम करने के बाद।
TanStack Table 8 अलग-अलग मॉड्यूल के माध्यम से ReactJS, Svelte, या Vue जैसी सबसे लोकप्रिय वेब UI बिल्डिंग लाइब्रेरी के साथ अच्छी तरह से एकीकृत होता है, और दस्तावेज़ीकरण वैनिला JS के माध्यम से दूसरों के साथ इसकी उपयोगिता का आश्वासन देता है।

<img src="/img/hq/vanilla-js-tanstack-table-8.png" title="TanStack टेबल डेमो" alt="TanStack टेबल डेमो">

वर्तमान में, वैनिला JS उपयोग के लिए कोई नमूने नहीं हैं, अन्य दृष्टिकोणों के विपरीत।
एक अच्छा शुरुआती बिंदु चयनित फ्रेमवर्क के भीतर एक नमूना परियोजना की जांच करना है,
साथ ही एकीकरण मॉड्यूल के संक्षिप्त कार्यान्वयन के साथ।
ऐसा करने के बाद, मैंने आपके लिए एक TanStack Table वैनिला JS डेमो तैयार किया है।

## TanStack Table 8 वैनिला JS के साथ

सबसे पहले, कृपया सामान्य [शुरुआती गाइड](https://tanstack.com/table/v8/docs/guide/tables) पर एक नज़र डालें।
यह बताता है कि टेबल मॉडल बनाने के लिए कौन से कदम आवश्यक हैं।
शुरू करने के लिए, अपनी निर्भरताओं में कोर `@tanstack/table-core@8.11.6` लाइब्रेरी जोड़ें।
सरलता के लिए, मैं इसे पेज में लोड करने के लिए `unpkg.com` सेवा का उपयोग करूंगा, जो मुझे
किसी भी वातावरण को स्थापित करने से मुक्त करता है।

```html
<head>
  <title>Vanilla JS Demo TanStack 8.11.6 Core UMD Table</title>
  <script src="https://unpkg.com/@tanstack/table-core@8.11.6/build/umd/index.development.js"></script>
</head>
```

अगला कदम HTML बॉडी में कुछ जगह तैयार करना है
जहाँ हम अपनी टेबल रखेंगे:

```html
<body>
    <h1>Demo TanStack 8.11.6 Core UMD Table</h1>
    <div id="table-root"></div>
</body>
```

अब, कुछ डमी डेटा तैयार करते हैं।
यह की-वैल्यू गुणों से युक्त ऑब्जेक्ट्स का एक JSON ऐरे हो सकता है:

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

टेबल मॉडल बनाने के लिए।
डेटा के अलावा, हमें कुछ कॉलम परिभाषाएँ बनानी होंगी।
उनकी एक विशिष्ट संरचना होनी चाहिए जिसका हम पालन कर सकते हैं
`createColumnHelper()` और `accessor()` उपयोगिताओं का उपयोग करके।
आयातित UMD मॉड्यूल पर वापस देखते हुए, इसे वैश्विक चर `TableCore` के तहत निर्यात किया जा रहा है।

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

ये एक्सेसर्स टेबल सामग्री के चारों ओर कुछ बुनियादी टेम्पलेट प्रदान करने का एक साफ तरीका प्रदान करते हैं।
बाद में पैरामीटर के साथ छेड़छाड़ करें ताकि देख सकें कि वे कैसे काम करते हैं।
अंत में, हम टेबल मॉडल बना सकते हैं। इसमें मुझे कुछ परीक्षण और
त्रुटियां लगीं क्योंकि कुछ गुणों को अनिवार्य माना गया था:

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

चूंकि TanStack Table एक हेडलेस कार्यान्वयन है,
आपको DOM खुद बनाना होगा। वैनिला JS DOM निर्माण में थोड़ा बोझिल है, लेकिन इतना कठिन नहीं है।
टेबल मॉडल से आप हेडर, पंक्तियाँ और फुटर जानकारी प्राप्त कर सकते हैं।
आप उन्हें `createElement` और `element.innerHTML` DOM API से बनाए गए
टेबल तत्वों पर मैप कर सकते हैं।

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

अंत में, रूट तत्व को टेबल तत्व से बदलें।
हेडलेस प्रकृति के लिए धन्यवाद, आपको टेबल तत्वों का उपयोग करने की बिल्कुल भी आवश्यकता नहीं है। आप कस्टम टेबल संरचनाएं बना सकते हैं।
`flexRender` के माध्यम से, आप अन्य UI फ्रेमवर्क के साथ [टेम्पलेटिंग को एकीकृत](https://github.com/TanStack/table/blob/v8.11.6/packages/react-table/src/index.tsx) भी कर सकते हैं।

## बोनस शोकेस - सॉर्टिंग

अब जब हम जानते हैं कि एक सरल मॉडल कैसे बनाया जाता है और यह DOM से कैसे संबंधित है, तो हम दस्तावेज़ीकरण में अधिक उन्नत विकल्पों को देख सकते हैं।
एक और, काफी महत्वपूर्ण, सीखने का कदम उठाया जाना है। हर बार जब हमारा मॉडल राज्य बदलता है, तो हमें टेबल को फिर से बनाना चाहिए।
यह कैसे करना है यह पता लगाने में कुछ समय लग सकता है, इसलिए मैं आपको एक सॉर्टिंग शोकेस के माध्यम से यह दिखाऊंगा।

सॉर्ट सुविधा जोड़ने के लिए, आपको मॉडल कॉन्फ़िगरेशन में अतिरिक्त विकल्प शामिल करने की आवश्यकता है:
```js

const table = TableCore.createTable({
    //...
    getSortedRowModel: TableCore.getSortedRowModel(),
    //...
});
```

सॉर्टिंग को कॉलम हेडर के `getToggleSortingHandler()` फ़ंक्शन से लौटाए गए हैंडलर को लागू करके सक्षम और टॉगल किया जा सकता है।
`drawTable` फ़ंक्शन के भीतर, आप इसे हेडर सेल तत्व के `onclick` फ़ंक्शन से बाँध सकते हैं।

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

अंत में, हमें सॉर्टिंग परिवर्तन पर टेबल को फिर से बनाने की आवश्यकता है - अन्यथा, दृष्टिगत रूप से कुछ भी नहीं बदलेगा।
सबसे अच्छा तरीका `onStateChange` जैसे टेबल स्टेट परिवर्तन पर कुछ वैश्विक श्रोता के माध्यम से होगा।
हालांकि, यह टेबल विकल्प कॉन्फ़िगर करने के लिए मुश्किल है क्योंकि ऐसा करने से कोर स्टेट सेटर अनबाउंड हो जाता है।
सौभाग्य से, यह इरादा है, और दस्तावेज़ीकरण को देखने के बाद, हम इसे `table.setOptions` के साथ वापस बाँधते हैं जो एक पुनरावर्तन को ट्रिगर नहीं करता है।

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

अंतिम टेबल डेमो ऐसा दिखना और काम करना चाहिए:

<center>
<iframe sandbox="allow-scripts" width="640" scrolling="no" height="220" src="/resources/vanilla-js-tanstack-table-8-umd.html"></iframe>
</center>


