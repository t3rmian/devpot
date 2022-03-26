---
title: The story of 'stale-while-revalidate' HTTP Cache and missing headers
url: revalidation-request-with-stale-while-revalidate
id: 79
tags:
  - web services
  - cache
author: Damian Terlecki
date: 2022-02-06T20:00:00
---

The *Cache-Control* HTTP header offers a wide range of possibilities for optimizing web
applications. Two of its relatively interesting values are the *stale-while-revalidate* and *stale-if-error*
attributes, described in the [RFC 5861](https://datatracker.ietf.org/doc/html/rfc5861) specification.
Support for the former attribute has already been implemented in the most popular browsers (except Safari) for 2 years now.

A quite interesting feature of the *Cache-Control* header and its *stale-while-revalidate* value is the ability to immediately
use a response from the browser cache and initiate a refresh in the background. Especially, when dealing with many proxy servers,
this option, at a low cost, can significantly improve UX (user experience).

The feature is great for standard resources such as style or script files. In the case of web services, we can
additionally use the 'Vary' header if the answer may differ significantly depending on the request headers. Unfortunately,
as it turns out, in the current version of Firefox, we may encounter some problems with the cache refresh query.

## Revalidation request

In the case of Chromium-derived browsers: Chrome (97.0.4692.99), Edge (97.0.1072.76), and Chrome (83.0.4254.27), handling
of the *stale-while-revalidate* attribute looks the same. The first query that meets the specification requirements returns the
previously cached response. The revalidation query is a copy of the original one and refreshes the stale entry in the background for future use.

<img src="/img/hq/stale-while-revalidate-chrome-network.png" alt="Requests in response to 'stale-while-revalidate' attribute of 'Cache-Control' responses in the Chrome browser's network tab" title="'stale-while-revalidate' in the 'network' tab (Chrome)">
<img src="/img/hq/stale-while-revalidate-chrome-request.png" alt="Asynchronous revalidation query in the Chrome browser's network tab" title="'stale-while-revalidate' background query (Chrome)">

Firefox (96.0.3) works a bit differently here. While the revalidation query reaches the HTTP resource in the background, it is
devoid of the original query headers, replaced by a default request.

<img src="/img/hq/stale-while-revalidate-firefox-network.png" alt="Missing headers in the revalidation request in the Firefox network tab" title="'stale-while-revalidate' revalidation request (Firefox)">

If our web service returns a response depending on a header set by the application, the client may receive an unexpected
response, e.g. in a different language, or even an error. But what if we apply the [*Vary*](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.4) response
header appropriate to this situation? Well, Chromium-based browsers will behave as before.

Firefox, on the other hand, correctly detects the difference between the missing headers of the revalidation query and the original
request. The cached response is returned. On the next query, however, the browser acts as if the memory for that query was empty
and repeats the correct request. Finally, the most up-to-date response is returned.

<img src="/img/hq/stale-while-revalidate-firefox-vary.png" alt="Foreground cache refresh queries in the Firefox network tab (caused by missing revalidation query headers)" title="'stale-while-revalidate' skips the cache (Firefox)">

In both cases, when using Firefox, you may encounter some unfortunate effects. You can receive a potentially incorrect response or
lose the advantage of background revalidation on every second request. For now, it's worth keeping this in mind if you plan to use the HTTP
cache. This behavior is particularly troublesome when combined with web services that depend on header values.

Here is the lambda function code imitating a web service followed by a simple test that you can run in your browser. 
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
        body: (lang === "de" ? "Hallo Welt!" : lang === "pl" ? "Hallo Welt!!" : "Hello World!")
            + " " + new Date().getTime(),
    };
    if (vary) {
        response.headers["Vary"] = "Accept-Language";
    }
    return response;
}
```

<iframe height="280px" width="400px" sandbox="allow-scripts" style="display:block; margin: 0 auto 0 auto; background:white;"
srcdoc="
<div>
    <h4 style='text-align: center;'>'stale-while-revalidate' test<br/>with custom 'Accept-Language' header value</h4>
    <div style='text-align: center; margin-bottom: 1em;'>
        <button style='width: 110px' onclick='load()'>Fetch<span id='fetch'></span></button>
        <button style='width: 150px' onclick='load(true)'>Fetch (Vary)<span id='fetch2'></span></button>
        <button onclick='clearCache()'>Clear</button>
    </div>
    <div style='margin-bottom: 0.5em;'>
        <div>Fetch time: <span id='debug'></span></div>
        <div>Response: <span id='result'></span></div>
    </div>
    <div>Expected:
    <ol style='margin-top: 0.5em;'>
        <li>Hallo Welt! (timestamp 1)</li>
        <li>Hallo Welt! (timestamp 1)</li>
        <li>Hallo Welt! (timestamp 2)</li>
        <li>Hallo Welt! (timestamp 3)</li>
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
          'Accept-Language': 'de'
        }
    })
        .then(response => response.text())
        .then(data => { 
            console.log('Received: ' + data);
            console.log(document);
            document.getElementById('result').innerText = data; 
            document.getElementById('debug').innerText = new Date().getTime().toString();
            document.getElementById('fetch').innerText = ' (wait 2s)';
            document.getElementById('fetch2').innerText = ' (wait 2s)';
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


From my point of view, the revalidation query in the case of Firefox does not seem to comply with the general
specification, especially with the [*fetch*](https://web.archive.org/web/20220130075352/https://fetch.spec.whatwg.org/#ref-for-concept-request-clone%E2%91%A1)
method specification, which I used in the test as an alternative to the XHR. If you use other clients, I encourage
you to verify the implementation.

Out of curiosity, I've checked the HTTP Cache extension of the Apache HTTP Client 4.5.13 (Java) library. The behavior
was consistent with what we've seen on the Chromium browsers. An especially noteworthy feature was the *stale-if-error*
attribute, the support of which is currently not implemented in browsers at the time.