---
title: Przekierowania w Netlify za pomocą funkcji serverless
url: netlify-przekierowania-serverless
id: 68
tags:
  - serverless
author: Damian Terlecki
date: 2021-06-13T20:00:00
---

Przekierowania w Netlify skonfigurować możemy za pomocą specjalnego pliku `_redirects` w katalogu, z któego serwowane są pliki naszej strony,
bądź w pliku konfiguracyjnym `netlify.toml`. Możliwości, jakie udostępnia nam ta platforma hostingowa, są całkiem potężne. Dostępne opcje obejmują
statyczną konfigurację wraz z oczekiwanymi statusami przekierowania, dynamiczną podmianę poszczególnych części ścieżki,
referencje do wartości parametrów, a także możliwość zdefiniowania powiązań z nagłówkami zapytania.

Netlify obecnie nie oferuje wsparcia dla pełnoprawnego przekierowania za pomocą wyrażeń REGEX.
Jeśli potrzebujemy przekierowanie uzależnić od pewnej części parametru bądź ścieżki to zdani będziemy naszą aplikację SPA,
bądź prosty plik HTML obsługujący (JavaScript) takie przekierowanie. Jeszcze innym sposobem jest wykorzystanie funkcji *serverless*.
W pakiecie startowym Netlify bowiem daje nam możliwość 125000 wywołań takich funkcji.

<img src="/img/hq/netlify-functions.png" alt="Netlify – funkcje serverless Lambda" title="Netlify – logi z funkcji serverless">

## Przekierowanie za pomocą funkcji serverless

Wyobraźmy sobie sytuację, w której użytkownik trafia na naszą stronę wraz z pewnym parametrem ***state***, którego część wskazuje, gdzie ma zostać przekierowany.
Może to być wartość definiująca wersję bądź język wybrany wcześniej przez użytkownika.
W takim przypadku możemy stworzyć funkcję *serverless* w języku JavaScript obsługującą przekierowanie:
```javascript
exports.handler = async function (event) {
    const lang = event.queryStringParameters.state?.split("-")[0] ?? "en";
    return {
        statusCode: 302,
        headers: {
            "Location": "/" + lang + event.path + "?" + new URLSearchParams(event.queryStringParameters),
        },
    };
}
```
Powyższa funkcja wyłuska wartość języka z parametru ***state=lang-XXXX-XXXX*** i przekieruje użytkownika ze strony */campaign?parametry* na */lang/campaign?parametry*.
Format parametrów wejściowych i wyjściowych funkcji lambda znajdziemy w [dokumentacji](https://docs.netlify.com/functions/build-with-javascript/).

Funkcję taką umieszczamy pod nazwą `netlify/functions/redirect.js`, relatywnie do katalogu bazowego zdefiniowanego w pliku konfiguracyjnym bądź na stronie Netlify.
W pliku konfiguracyjnym `netlify.toml` możemy również zmienić lokalizację folderu z funkcjami:
```groovy
[functions]
  directory = "src/netlify/functions"
```

Standardowo funkcja dostępna będzie do wywołania pod ścieżką */.netlify/functions/redirect*. Możemy ją przetestować instalując serwer testowy:

> npm install netlify-cli -g  
> netlify dev --functions src/netlify/functions
> 
> ◈ Functions server is listening on 46867  
> curl http://localhost:46867/.netlify/functions/redirect?state=en-XXXX-XXXX

Do powiązania przekierowania z właściwą lokacją startową wystarczy, że dodamy tzw. przepisanie (rewrite) ścieżki w pliku `_redirects`:
```
/campaign /.netlify/functions/redirect 200
/:lang/* /:lang/index.html 200
```
Status o wartości 200 spowoduje, że klient odwiedzający */campaign* zostanie obsłużony przez naszą funkcję bez zmiany ścieżki w przeglądarce.
Ostatecznie użytkownik zostanie przekierowany do aplikacji SPA w lokalizacji */en/campaign*. Może to mieć sens, gdy pod różnymi ścieżkami 
mamy wdrożone różne wersje (np. językowe) aplikacji.

> **Uwaga:** Funkcje *serverless* definiowane w Netlify wdrażane są na platformie AWS Lambda. Na obecną chwilę te napisane w języku JavaScript
> korzystają z wersji środowiska uruchomieniowego Node.js 12.  
> Do [pełnego wsparcia](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#browser_compatibility) zaprezentowanego przykładu
> konieczne będzie ustawienie parametru środowiskowego `AWS_LAMBDA_JS_RUNTIME` z wartością `nodejs14.x` w aplikacji internetowej Netlify.
> W przeciwnym wypadku może nas zaskoczyć poniższy błąd podczas wizyty na stronie funkcji przekierowania:
>```javascript
{
  "errorType": "Runtime.UserCodeSyntaxError",
  "errorMessage": "SyntaxError: Unexpected token '.'",
  "trace": [
    "Runtime.UserCodeSyntaxError: SyntaxError: Unexpected token '.'",
    "    at _loadUserApp (/var/runtime/UserFunction.js:98:13)",
    "    at Object.module.exports.load (/var/runtime/UserFunction.js:140:17)",
    "    at Object.<anonymous> (/var/runtime/index.js:43:30)",
    "    at Module._compile (internal/modules/cjs/loader.js:999:30)",
    "    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1027:10)",
    "    at Module.load (internal/modules/cjs/loader.js:863:32)",
    "    at Function.Module._load (internal/modules/cjs/loader.js:708:14)",
    "    at Function.executeUserEntryPoint [as runMain] (internal/modules/run_main.js:60:12)",
    "    at internal/main/run_main_module.js:17:47"
  ]
}
```