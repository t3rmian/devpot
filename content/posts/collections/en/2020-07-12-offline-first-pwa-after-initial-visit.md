---
title: Offline-first PWA after initial visit
url: offline-first-pwa-after-initial-visit
id: 34
category:
  - javascript: JS
tags:
  - service workers
  - pwa
  - cache
author: Damian Terlecki
date: 2020-07-12T20:00:00
source: https://github.com/t3rmian/devpot/pull/64/files
---

Offline-first is an approach closely related to PWA (Progressive Web App), which allows visiting users to navigate the site in the event of loss or a poor internet connection. This technique is usually based on proxies, the so-called service workers, and includes caching requested sources in the browser's storage. In a situation where the browser cannot connect to the server, the resources are served from the cache.

## Service Workers

A service worker is actually a script file (JavaScript) that runs in the background, mediating communication between server and client. To correctly implement it in your application, it is worth familiarizing yourself with the life cycle of a service worker and the events that it can handle:

<img src="/img/hq/sw-events.png" alt="Events handled by service workers" title="Events handled by service workers">
<center>Source: <a src="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers">Using Service Workers</a> by <a src="https://wiki.developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers$history">Mozilla Contributors</a> licensed under <a href="https://creativecommons.org/licenses/by-sa/2.5/">CC-BY-SA 2.5</a>.</center>

The first step required to add a service worker to our site is its registration by the client (script on the index page). After parsing, the service worker goes into the `installing` state. The next phase `waiting` lasts until clients (e.g. other browser tabs) of the same application with active workers are closed. We can skip this process by invoking `skipWaiting()` method.

<img src="/img/hq/service-worker-waiting-to-activate.png" alt="Service Worker without skipWaiting()" title="Service worker without skipWaiting(): Chrome DevTools -> Application -> Service Workers">

> **Note:** skipping the waiting phase can lead to code and data integrity issues – resources loaded by the previous worker (in a different tab) may not be compatible with those currently being installed.

In the next phase of `activating` we can take care of clearing the old cache. After its completion, our worker will start handling the following (functional) events:
- fetch - load network resource;
- sync - perform a task when the user has an internet connection;
- push - receive a message from the server.

Actually, connecting to the client (browser tab) will take place only after refreshing the page. If we want to speed up this process, we can use the `clients.claim ()` function.

> **Note:** connecting to a client that already has a page loaded can result in inconsistent behavior – e.g. if we want to cache all resources that have been requested, the resources that were requested up to the client claim will not be cached.

Here is an example implementation of a worker that caches every successful answer and query, and in case of problems tries to download a resource from memory:

```javascript
// offline-sw.js
const CACHE = "offline-cache-v1";
const PREFETCH_PAGES = ["/404"];

const self = this;
self.addEventListener("install", function (event) {
  console.debug("[SW] Pre-install")
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PREFETCH_PAGES);
    })
  );
  console.debug("[SW] Post-install")
});

self.addEventListener('activate', function(event) {
  console.debug("[SW] Pre-activate")
  event.waitUntil(self.clients.claim());
  console.debug("[SW] Post-activate")
});

self.addEventListener("fetch", function (event) {
  console.debug("[SW] Fetch -> " + event.request.url)
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        event.waitUntil(updateCache(event.request, response.clone()));
        console.debug("[SW] Fetch network first -> " + event.request.url)
        return response;
      })
      .catch(function (error) {
        console.debug("[SW] Fetch cache first -> " + event.request.url)
        return fromCache(event.request);
      })
  );
});

function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (matching) {
      if (!matching || matching.status === 404) {
        return Promise.reject("no-match");
      }

      return matching;
    });
  });
}

function updateCache(request, response) {
  return caches.open(CACHE).then(function (cache) {
    return cache.put(request, response);
  });
}
```


## Client

Now, we only need to register the worker on the client-side. Before doing this, however, we should check whether the client (browser) provides support for service workers by querying the `window.navigator` object for the `serviceWorker` property. Moreover, it is worth considering in which phase of page loading we want to register our worker.

It is good practice to delay registration until the site and its resources are fully loaded. Such prioritization makes our site load a little bit faster on the first visit, which can be of a major point in the case of users with worse internet capabilities.

<img loading="lazy" src="/img/hq/service-worker-not-working.png" alt="Service Worker without clients.claim()" title="Service Worker without clients.claim()">

On the other hand, we can use an aggressive caching strategy for all resources and register the worker at the very beginning. Unfortunately, due to its asynchronous processing, some resources will be loaded before the worker is activated. In the case of an offline-first approach, we can solve the problem by combining `clients.claim ()` and/or:
1. Delaying page loading until activation of the worker – difficult to implement and undesirable due to loading delay;
2. Automatic page refresh after activation of the worker – page refresh may be undesirable;
3. Pre-caching all necessary resources during the install phase – difficulties with dynamically generated names;
4. Re-downloading resources after activating the worker – complicated for non-basic queries (body/cors);
5. Make peace with the fact that the service worker will start caching all of the resources only after the reload.

As you can guess, each of these methods is somewhat inconvenient. The 3rd solution can be seen in the service worker code shown above – before activation, we download the *404* for caching purposes. The 2nd and 4th option could be implemented on the client-side:

```html
<script type="text/javascript">
  // /index.html
  if ("serviceWorker" in navigator) {
    console.debug("Deferring service worker registration to page load");
    window.addEventListener("load", function() {
      if (navigator.serviceWorker.controller) {
        console.debug("[Client] This page is already controlled by: " + navigator.serviceWorker.controller.scriptURL);
      } else {
        console.debug("[Client] This page is currently not controlled by a service worker.");
        console.debug("[Client] Registering a new service worker");
        navigator.serviceWorker.register("/offline-sw.js", {
          scope: "/",
        }).then(function() {
          console.debug("[Client] Successfully registered service worker");
          navigator.serviceWorker.addEventListener("controllerchange", function(event) {
            console.debug("[Client] Service worker activated");
            if ("performance" in window) {
              refetch();
            } else {
              reload();
            }
          });
        }).catch(function(error) {
          console.error(error);
        });
      };
    })
  } else {
    console.debug("Service workers are not supported");
  }

  function reload() {
    console.debug("[Client] Reloading page to loaded resources for caching")
    location.reload();
  }

  function refetch() {
    console.debug("[Client] Requesting already loaded resources for caching")
    performance.getEntries()
      .map(function(resource) {
        return new Request(resource.name, { mode: "no-cors" });
      }).forEach(function(request) {
        console.debug("[Client] Fetch -> " + request.url);
        fetch(request);
      });
  }
</script>
```

Here I used [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance) to request the resources again. This interface allows you to view the files loaded so far. This solution is satisfactory for static files and some simple GET requests.

To load fonts from Google servers, you'll need to add `{ mode: "no-cors" }`. When the resources are re-downloaded, the already active service worker will cache them as planned.

> **Note:** When using the Performance API, it is worth noting that at the moment of SW activation some requests (ajax) may be still in progress and they will not be included in the list received from `getEntries()`, thus they will not cached. This edge problem can be solved using [PerformanceObservera](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver) based on the [startTime](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/startTime) of the resource being requested.

## Summary

Of course, activating the service worker and refreshing does not preclude pre-caching resources. For example, if you have a separate *404* page in the application, it is worth loading it in advance, because its first opening may occur in the offline mode. Then it will be loaded from memory, even though the user has never seen it before.

On the same page, it is also worth displaying a message when connection problems arise. Then we could serve it from the cache in case we cannot connect to the server and the correct page is missing in the cache.

You should check an example test branch with the PWA application in the offline-first mode deployed [on Netlify](https://deploy-preview-64--418.netlify.app/). After the initial load (or clearing site data) and selection of the offline mode in the service worker options, the application should fall back to the cache. With some sporadic problems (edge issue with Performance API when serving the post from cache), the first five posts (also after refreshing) and a *404* page should be served correctly.

<img loading="lazy" src="/img/hq/offline-first-service-worker-demo.png" alt="Offline-first Service Worker demo" title="Offline-first Service Worker demo">
