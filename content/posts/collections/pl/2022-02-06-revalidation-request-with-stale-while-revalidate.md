---
title: Brakujące nagłówki przy 'stale-while-revalidate' HTTP Cache
url: stale-while-revalidate-brakujące-nagłówki
id: 79
tags:
  - web services
  - cache
author: Damian Terlecki
date: 2022-02-06T20:00:00
---

Nagłówek HTTP *Cache-Control* daje szerokie pole do popisu przy optymalizacji aplikacji internetowych.
Jednymi ze względnie ciekawych jego wartości są atrybuty *stale-while-revalidate* oraz *stale-if-error*,
których sposób działania opisany został w specyfikacji [RFC 5861](https://datatracker.ietf.org/doc/html/rfc5861).
Już od dwóch lat jego obsługa tego pierwszego zaimplementowana jest w najpopularniejszych przeglądarkach (z wyjątkiem Safari).

Interesującą funkcją atrybutu *stale-while-revalidate* nagłówka *Cache-Control* jest możliwość natychmiastowego otrzymania
odpowiedzi z pamięci podręcznej przeglądarki z jednoczesnym jej odświeżeniem.
Szczególnie, gdy na drodze zapytania mamy do czynienia z wieloma serwerami pośredniczącymi (które obsługują pamięć HTTP),
opcja ta, niewielkim kosztem, może znacząco poprawić UX (user experience).

Funkcjonalność świetnie sprawdza się w przypadku standardowych zasobów typu pliki stylów bądź skrypty.
W przypadku web serwisów możemy dodatkowo skorzystać z nagłówka 'Vary' jeśli odpowiedź może znacznie różnić
się w zależności od nagłówka zapytania. Niestety jak się okazuje, w obecnej wersji Firefoxa, możemy natknąć się
na pewne problemy z zapytaniem odświeżającym pamięć podręczną.

## Rewalidacja

W przypadku przeglądarek wywodzących się z Chromium: Chrome (97.0.4692.99), Edge (97.0.1072.76) i Chrome (83.0.4254.27) obsługa atrybutu *stale-while-revalidate* wygląda podobnie.
Pierwsze zapytanie spełniające warunki specyfikacji zwraca poprzednio zapamiętaną odpowiedź.
Zapytanie w tle jest kopią oryginalnego zapytania i odświeża pamięć, dokładnie tak jak moglibyśmy zakładać.

<img src="/img/hq/stale-while-revalidate-chrome-network.png" alt="Zapytania na skutek odpowiedzi z atrybutem 'stale-while-revalidate' nagłówka 'Cache-Control' w zakładce sieć przeglądarki Chrome" title="'stale-while-revalidate' w zakładce 'sieć' (Chrome)">
<img src="/img/hq/stale-while-revalidate-chrome-request.png" alt="Zapytania odświeżające pamięć podręczną w tle w zakładce sieć przeglądarki Chrome" title="'stale-while-revalidate' zapytanie w tle (Chrome)">

Firefox (96.0.3) działa tutaj nieco inaczej. Zapytanie w tle co prawda trafia do oczekiwanego zasobu HTTP, jest jednak
pozbawione nagłówków oryginalnego zapytania, które zastąpione jest żądaniem.

<img src="/img/hq/stale-while-revalidate-firefox-network.png" alt="Zapytania odświeżające pamięć podręczną w tle w zakładce sieć przeglądarki Firefox (brakujące nagłówki)" title="'stale-while-revalidate' zapytanie w tle (Firefox)">


Jeśli nasz web serwis zwraca odpowiedź zależną od jakiegoś nagłówka ustawianego przez aplikację, klient może
otrzymać nieoczekiwaną odpowiedź, np. w innym języku, bądź nawet błąd. Co jednak gdy właściwie dla tej sytuacji
zaaplikujemy nagłówek odpowiedzi [*Vary*](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.4)? Otóż przeglądarki bazujące na Chromium
zachowają się tak jak poprzednio.

Firefox z kolei poprawnie wykryje różnicę pomiędzy brakującymi nagłówkami zapytania w tle oraz
oryginalnego żądania serwując poprzednią odpowiedź. Przy następnym zapytaniu zachowa się już, jakby pamięć
dla tego zapytania była pusta i odpyta serwer właściwym żądaniem, zwracając ostatecznie aktualną odpowiedź.

<img src="/img/hq/stale-while-revalidate-firefox-vary.png" alt="Zapytania odświeżające pamięć podręczną na pierwszym planie w zakładce sieć przeglądarki Firefox (spowodowane brakującymi nagłówkami zapytania w tle)" title="'stale-while-revalidate' bez wykorzystania pamięci podręcznej (Firefox)">

W obu przypadkach mamy więc negatywne skutki przy użyciu Firefoxa – otrzymanie potencjalnie niewłaściwej odpowiedzi bądź nieciągłe
wykorzystanie pamięci podręcznej, w co drugim zapytaniu. Na obecną chwilę warto mieć na uwadze to zachowanie
przy wykorzystaniu pamięci podręcznej HTTP. Szczególnie w web serwisach wykorzystujących nagłówki.

Poniżej zamieszczam kod funkcji lambda imitującej web serwis oraz prosty test, który możesz przeprowadzić w swojej przeglądarce. 
```js
exports.handler = async function (event) {
    const lang = event.headers['accept-language'] || 'en'
    const vary = event['queryStringParameters'].vary
    const response = {
        statusCode: 200,
        headers: {
            "Cache-Control": "max-age=1, stale-while-revalidate=60",
            "Access-Control-Allow-Origin": "*",
            "X-Robots-Tag": "noindex",
        },
        body: (lang === "de" ? "Hallo Welt!" : lang === "pl" ? "Witaj Świecie!" : "Hello World!")
            + " " + new Date().getTime(),
    };
    if (vary) {
        response.headers["Vary"] = "Accept-Language";
    }
    return response;
}
```

<iframe height="280px" width="440px" sandbox="allow-scripts" style="display:block; margin: 0 auto 0 auto; background:white;"
srcdoc="
<div>
    <h4 style='text-align: center;'>Test atrybutu 'stale-while-revalidate'<br/>z wybraną wartością 'Accept-Language'</h4>
    <div style='text-align: center; margin-bottom: 1em;'>
        <button style='width: 130px' onclick='load()'>Fetch<span id='fetch'></span></button>
        <button style='width: 170px' onclick='load(true)'>Fetch (Vary)<span id='fetch2'></span></button>
        <button onclick='clearCache()'>Reset</button>
    </div>
    <div style='margin-bottom: 0.5em;'>
        <div>Czas nadejścia: <span id='debug'></span></div>
        <div>Odpowiedź: <span id='result'></span></div>
    </div>
    <div>Oczekujemy:
    <ol style='margin-top: 0.5em;'>
        <li>Witaj Świecie! (timestamp 1)</li>
        <li>Witaj Świecie! (timestamp 1)</li>
        <li>Witaj Świecie! (timestamp 2)</li>
        <li>Witaj Świecie! (timestamp 3)</li>
    </ol>
    </div>
</div>
<script>
let cacheKey = new Date().getTime().toString();
let lastTimeout;
function clearCache() {
    document.getElementById('debug').innerText = null;
    document.getElementById('result').innerText = null;
    document.getElementById('fetch').innerText = null;
    document.getElementById('fetch2').innerText = null;
    clearTimeout(lastTimeout);
    cacheKey = new Date().getTime().toString();
}
function load(vary) {
    let queryParams = '?cacheKey=' + cacheKey;
    if (vary) {
        queryParams += '&vary=true';
    }
    fetch('https://blog.termian.dev/test/stale-while-revalidate' + queryParams, {
        headers: {
          'Accept-Language': 'pl'
        }
    })
        .then(response => response.text())
        .then(data => { 
            console.log('Received: ' + data);
            console.log(document);
            document.getElementById('result').innerText = data; 
            document.getElementById('debug').innerText = new Date().getTime().toString();
            document.getElementById('fetch').innerText = ' (zaczekaj 2s)';
            document.getElementById('fetch2').innerText = ' (zaczekaj 2s)';
            clearTimeout(lastTimeout);
            lastTimeout = setTimeout(()=>{
                    document.getElementById('fetch').innerText = null;
                    document.getElementById('fetch2').innerText = null;
            }, 2000);
        });
}
</script>
" > 
</iframe>


Z mojego punktu widzenia zapytanie w tle w przypadku Firefoxa nie wygląda na zgodne z ogólną specyfikacją,
a w szczególności pod względem metody [*fetch*](https://web.archive.org/web/20220130075352/https://fetch.spec.whatwg.org/#ref-for-concept-request-clone%E2%91%A1),
z której skorzystałem w teście jako alternatywy do XHR. Jeśli korzystamy z innych klientów, to warto zweryfikować implementację w tym zakresie.

Sprawdziłem z ciekawości rozszerzenie HTTP Cache biblioteki Apache HTTP Client 4.5.13 (Java) i zachowanie było w tym przypadku
zbieżne z przeglądarką Chrome. Na szczególną uwagę zasługuje tu też możliwość wykorzystania atrybutu *stale-if-error*,
którego obsługa na dzień dzisiejszy nie jest zaimplementowana w przeglądarkach.