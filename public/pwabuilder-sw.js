const CACHE = "pwabuilder-offline";
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
        if (request.url.indexOf(self.registration.scope) !== -1) {
          return cache.match("404")
        } else {
          return Promise.reject("no-match");
        }
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
