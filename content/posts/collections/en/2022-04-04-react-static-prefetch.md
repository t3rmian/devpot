---
title: React Static prefetch
url: react-static-prefetch
id: 83
category:
  - javascript: JS
tags:
  - performance
  - reactjs
  - react-static
author: Damian Terlecki
date: 2022-04-03T20:00:00
---

React Static, a lightweight static page generator based on ReactJS, has just entered maintenance mode. In addition to
the JAMStack-based architecture (JavaScript/<wbr>API/<wbr>Markup), *react-static* specializes in generating an
optimized code-split version of your website. The intention is to load the application as quickly as possible and prefetch
other pages in the background. This allows you to experience a no-delay navigation between the static pages of your website.

## Preloader

You will find the pre-fetch function on the [client-side](https://github.com/react-static/react-static/blob/v7.6.2/packages/react-static/src/browser/index.js).
A preloader periodically scans the list of links in the page
document and registers the fetch function. Newly detected references are loaded as soon as the link [appears](https://github.com/react-static/react-static/blob/v7.6.2/packages/react-static/src/browser/utils/Visibility.js)
in the browser window (Intersection Observer API).

This mechanism can be disabled by setting the `disablePreload` flag to `true` in the exported configuration of
the *static.config.js* file. Selectively, you do this by adding the `data-prefetch="false"` attribute on the HTML element. At the
same time, nothing prevents you from implementing your own prefetch conditions.

<img src="/img/hq/react-static-prefetch.gif" alt="React Static prefetch on hover" title="React Static prefetch on hover">

For example, when you have too many links on the screen, you may want to prefetch selected ones only after hovering over
them with a cursor. In this case, import the `prefetch` function, implement `onVisible` (unfortunately, it is not
exported) as in the original version, and place the relevant logic in your own preloader.

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
The preloader is started right after the application initialization (*index.js*).