---
title: Offline-first PWA po pierwszej wizycie
url: offline-first-pwa-po-pierwszej-wizycie
id: 34
tags:
  - javascript
  - service workers
  - pwa
  - cache
author: Damian Terlecki
date: 2020-07-12T20:00:00
source: https://github.com/t3rmian/devpot/pull/64/files
---

Offline-first to podejście blisko związane z aplikacjami PWA (Progressive Web App), pozwalające użytkownikom odwiedzającym stronę na korzystanie z niej w przypadku słabego połączenia z internetem bądź jego braku/utraty. Technika ta najczęściej bazuje na pośrednikach, tzw. service workerach i obejmuje zapisywanie pobranych źródeł do pamięci przeglądarki. W sytuacji, gdy przeglądarka nie może połączyć się z serwerem, zasoby serwowane są właśnie z pamięci.

## Service Workers

Service worker jest właściwie plikiem skryptowym (JavaScript), który wykonuje się w tle, pośrednicząc w komunikacji z serwerem. Aby poprawnie zaimplementować go w naszej aplikacji, warto zapoznać się z cyklem życia service workerów oraz zdarzeniami, które są obsługiwane:

<img src="/img/hq/sw-events.png" alt="Zdarzenia obsługiwane przez service workerów" title="Zdarzenia obsługiwane przez service workerów">
<center>Źródło: <a href="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers">Using Service Workers</a> autorstwa <a href="https://wiki.developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers$history">Mozilla Contributors</a> na licencji <a href="https://creativecommons.org/licenses/by-sa/2.5/">CC-BY-SA 2.5</a>.</center>

Pierwszym krokiem potrzebnym do dodania naszego service workera jest jego rejestracja przez klienta (skrypt na stronie). Po przeanalizowaniu kodu, service worker przechodzi w stan `installing`. Po zainstalowaniu kolejna faza `waiting` trwa aż do momentu, gdy klienci (np. inne karty przeglądarki) tej samej aplikacji z aktywnymi workerami zostaną zamknięci. Etap oczekiwania możemy pominąć, wywołując metodę `skipWaiting()`.

<img src="/img/hq/service-worker-waiting-to-activate.png" alt="Service Worker bez skipWaiting()" title="Service worker bez skipWaiting(): Chrome DevTools -> Application -> Service Workers">

> **Uwaga:** pominięcie fazy oczekiwania może prowadzić do problemów związanych ze spójnością kodu i danych – zasoby załadowane przez poprzedniego workera (w innej karcie) mogą nie być kompatybilne z obecnie instalowanym.

W kolejnej fazie `activating` możemy zająć się wyczyszczeniem starych rekordów. Po jej zakończeniu nasz worker zacznie obsługiwać następujące zdarzenia:
- fetch – pobranie zasobu;
- sync – wykonanie zadania, gdy użytkownik będzie miał połączenie z internetem;
- push – odebranie wiadomości z servera.

Właściwie to podpięcie się pod klienta (kartę przeglądarki) nastąpi dopiero po odświeżeniu strony. Jeśli chcemy przyspieszyć ten proces, możemy użyć funkcji `clients.claim()`.

> **Uwaga:** podpięcie pod klienta, który ma już załadowaną stronę może skutkować niespójnym zachowaniem – np. jeśli cache'ujemy wszystkie zrequestowane zasoby, to dotychczasowe zasoby nie zostaną zapisane w pamięci podręcznej.

Oto przykładowa implementacja workera, który cache'uje każdą udaną odpowiedź i zapytanie, a w razie problemów próbuje pobrać zasób z pamięci:

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


## Klient

Do szczęścia brakuje nam już tylko jeszcze rejestracji naszego workera. Przed tym powinniśmy jednak sprawdzić, czy klient (przeglądarka) zapewnia wsparcie dla service workerów, odpytując obiekt `window.navigator` w poszukiwaniu właściwości `serviceWorker`. Następnie warto zastanowić się, w której fazie ładowania strony chcemy zarejestrować naszego workera.

Dobrą praktyką jest opóźnienie rejestracji do momentu, gdy strona i jej zasoby w pełni się załadowały. Dzięki takiej priorytetyzacji nasza strona nieco szybciej załaduje się przy pierwszym wejściu, co może mieć duże znaczenie w przypadku internautów z gorszym połączeniem internetowym.

<img loading="lazy" src="/img/hq/service-worker-not-working.png" alt="Service Worker bez clients.claim()" title="Service Worker bez clients.claim()">

Z drugiej strony możemy zastosować agresywną strategię cache'owania wszystkich zasobów i zarejestrować workera na samym początku. Niestety ze względu na jego asynchroniczne działanie, część zasobów finalnie załaduje się przed jego aktywacją. W przypadku podejścia offline-first problem możemy rozwiązać poprzez kombinację `clients.claim()` oraz:
1. Opóźnienie ładowania strony aż do aktywacji workera – trudne w implementacji, niepożądane ze względu opóźnienie w ładowaniu;
2. Automatyczne wywołanie odświeżenia strony po aktywacji workera – odświeżenie strony może być niepożądane;
3. Pre-cache'owanie wszystkich niezbędnych zasobów w fazie install – trudności w przypadku dynamicznie generowanych nazw;
4. Ponowne pobranie zasobów po aktywacji workera – komplikuje się w przypadku bardziej złożonych zapytań (body/cors);
5. Pogodzenie się z tym, że service worker w pełni załaduje aplikację do cache'a dopiero po odświeżeniu.

Jak łatwo się domyślić każdy z tych sposobów wiąże się z jakimiś niedogodnościami. Punkt 3. można zaobserwować w kodzie service workera pokazanym wyżej – przed aktywacją pobieramy stronę *404* w celu zapisania w pamięci podręcznej. Punkty 2. i 4. można zaimplementować po stronie klienta:

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

Do ponownego pobrania zasobów wykorzystałem [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance). Interfejs ten pozwala na wyświetlenie załadowanych do tej pory plików. W przypadku plików statycznych i prostych requestów GET takie rozwiązanie jest zadowalające.

Do załadowania fontów z serwerów google, konieczne będzie dodanie `{ mode: "no-cors" }`. W momencie ponownego pobrania zasobów, aktywny już service worker zajmie się ich zapisaniem do pamięci.

> **Uwaga:** Korzystając z Performance API warto zauważyć, że w momencie aktywacji SW część requestów (ajax) może być w trakcie realizacji i nie będą one jeszcze wpisane na liste otrzymaną z `getEntries()`, tym samym nie zostaną ponownie załadowane i zapisane do pamięci. Ten problem brzegowy można rozwiązać za pomocą [PerformanceObservera](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver) biorąc pod uwagę [czas początkowy](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/startTime) zrequestowanego zasobu.

## Podsumowanie

Oczywiście aktywacja service-workera i odświeżenie nie wyklucza samego pre-cache'owanie zasobów. Przykładowo jeśli w aplikacji masz oddzielną stronę *404*, warto ją zawczasu załadować, gdyż pierwsze jej otworzenie może nastąpić w trybie offline. Wtedy zostanie ona załadowana z pamięci, mimo, że użytkownik nigdy wcześniej jej nie widział.

Na tej samej stronie warto wyświetlić wiadomość w przypadku problemów z połączeniem i serwować ją z cache w przypadku, gdy nie możemy połączyć się z serwerem, a w cache'u brakuje właściwej strony.

Przykładowa branch testowy z aplikacją PWA w trybie offline-first dodałem [na Netlify](https://deploy-preview-64--418.netlify.app/pl/). Po pierwszym uruchomieniu (clear site data) i wybraniu trybu offline w service workerze, ze sporadycznymi problemami (problem brzegowy z Performance API podczas serwowania postu z cache) aplikacja powinna umożliwić wyświetlenie pięciu pierwszych postów (również po odświeżeniu) oraz strony *404* dla pozostałych zasobów.

<img loading="lazy" src="/img/hq/offline-first-service-worker-demo.png" alt="Offline-first Service Worker demo" title="Offline-first Service Worker demo">