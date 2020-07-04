const CACHE = "pwabuilder-offline";
const PREFETCH_PAGES = ["/404"];

const self = this;
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PREFETCH_PAGES);
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  if (/(\.[^.]{8}\.(js|css)|png|jpeg|jpg|webm|gif|svg)$/.test(event.request.url)) {
    return cacheFirst(event);
  } else {
    return networkFirst(event);
  }
});

function networkFirst(event) {
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        event.waitUntil(updateCache(event.request, response.clone()));
        return response;
      })
      .catch(function (error) {
        return fromCache404(event.request);
      })
  );
}

function cacheFirst(event) {
  event.respondWith(
    fromCache(event.request)
      .catch(function (error) {
        return fetch(event.request)
        .then(function (response) {
          event.waitUntil(updateCache(event.request, response.clone()));
          return response;
        })
      })
  );
}

function fromCache404(request) {
  try {
  return fromCache(request)
  } catch (error) {
    if (request.url.indexOf(self.registration.scope) !== -1) {
      return cache.match("404")
    } else {
      throw error;
    }
  }
}

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
