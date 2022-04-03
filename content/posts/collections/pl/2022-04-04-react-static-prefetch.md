---
title: React Static prefetch
url: react-static-prefetch
id: 83
category:
  - javascript: JS
tags:
  - wydajność
  - reactjs
author: Damian Terlecki
date: 2022-04-03T20:00:00
---

React Static, czyli lekki generator stron statycznych oparty na ReactJS przeszedł właśnie w tryb maintenance.
Oprócz przewodniej architektury opartej o JAMStack (JavaScript/<wbr>API/<wbr>Markup), *react-static* wyróżnia się
generowaniem optymalnie podzielonej na części wersji Twojej strony. W zamierzeniu aplikacja ładuje się bardzo szybko,
a przy pojawieniu się na ekranie odnośników do kolejnych stron, z wyprzedzeniem pobiera je w tle. Dzięki temu nie
uświadczymy oczekiwania, osiągając płynność w nawigacji.

## Preloader

Funkcję odpowiedzialną za pobieranie z wyprzedzeniem znajdziemy [po stronie klienta](https://github.com/react-static/react-static/blob/v7.6.2/packages/react-static/src/browser/index.js).
*Preloader* co pewien określony czas skanuje listę odnośników w dokumencie strony i dla nowo wykrytych rejestruje 
funkcję pobierania. Tuż po [pojawieniu się](https://github.com/react-static/react-static/blob/v7.6.2/packages/react-static/src/browser/utils/Visibility.js)
odnośnika w okienku przeglądarki (Intersection Observer API) dane strony zostają pobrane w tle.

Mechanizm pobierania z wyprzedzeniem wyłączyć możemy, ustawiając flagę `disablePreload` na `true` w konfiguracji wyeksportowanej w pliku *static.config.js*.
Selektywnie zrobimy to, dodając do elementu atrybut `data-prefetch="false"`.
Jednocześnie nic nie stoi na przeszkodzie implementacji własnych warunków pobierania.

<img src="/img/hq/react-static-prefetch.gif" alt="React Static prefetch przy najechaniu kursorem" title="React Static prefetch przy najechaniu kursorem">

Przykładowo, gdy mamy zbyt dużo odnośników na ekranie, wybrane z nich możemy chcieć pobierać dopiero po najechaniu na nie kursorem.
W takim przypadku importujemy funkcję `prefetch`, implementujemy `onVisible` (niestety nie jest ona wyeksportowana)
na swoje podobieństwo, a interesującą nas logikę umieszczamy we własnym *preloaderze*.

```javascript
import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';
import { prefetch } from "react-static";

export default App;

if (typeof document !== "undefined") {
    const target = document.getElementById("root");

    const renderMethod = target.hasChildNodes()
        ? ReactDOM.hydrate
        : ReactDOM.render;

    const render = Comp => {
        renderMethod(<Comp />, target);
    };

    render(App);

    if (module && module.hot) {
        module.hot.accept("./App", () => {
            render(App);
        });
    }
    startPreloader();
}

function startPreloader() {
    const prefetchCallback = (el, href) => {
        if (!el.getAttribute("prefetch-on-hover")) {
            prefetch(href);
            return;
        }
        const onHover = function() {
            el.removeEventListener("pointerenter", onHover)
            prefetch(href);
        };
        el.addEventListener("pointerenter", onHover)
    };

    if (typeof document !== 'undefined') {
        const run = () => {
            const els = [].slice.call(document.getElementsByTagName('a'))
            els.forEach(el => {
                const href = el.getAttribute('href')
                if (href) {
                    onVisible(el, prefetchCallback.bind(null, el, href));
                }
            })
        }

        setInterval(run, Number(process.env.REACT_STATIC_PRELOAD_POLL_INTERVAL))
    }
}

const list = new Map()
const onVisible = (element, callback) => {/*...*/}
```

Preloader włączamy tuż po załadowaniu aplikacji (*index.js*). 