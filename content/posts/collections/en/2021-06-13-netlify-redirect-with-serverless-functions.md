---
title: Netlify redirects using serverless functions
url: netlify-serverless-redirect
id: 68
category:
- other: Misc
tags:
  - serverless
author: Damian Terlecki
date: 2021-06-13T20:00:00
---

Redirects in Netlify can be configured through the `_redirects` file placed in the publish directory,
or in the `netlify.toml` configuration file. The available options are quite powerful. You can define a
static configuration with the expected redirect status, replace individual parts of the path,
reference parameter values, and also redirect based on query headers.

Netlify currently does not offer full REGEX expression support.
If you need a redirection based on a fragment of the parameter or path, you will have to implement it in your SPA application
or serve a simple HTML file that handles (JavaScript) such redirection. Yet another way is to use the serverless function.
In the starter plan, Netlify currently provides quite generous limits of 125,000 free serverless function requests.

<img src="/img/hq/netlify-functions.png" alt="Netlify serverless Lambda functions" title="Netlify serverless Lambda function logs">

## Serverless function redirects

Let's imagine a situation in which we want to redirect a user that visits the root of our website, based on a ***state*** parameter.
However, only the first part of the parameter value indicates information relevant for redirection.
This could be a value that describes the version or the language that the user previously selected.
In this case, we can create a serverless function in JavaScript that will handle the redirection:
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

The above function extracts the language value from the ***state=lang-XXXX-XXXX*** parameter redirecting the user
from the */campaign?parameters* entry location to the */lang/campaign?parameters*.
The format of the input and output parameters of lambda functions can be found in [the documentation](https://docs.netlify.com/functions/build-with-javascript/).

Such a function should be placed under a chosen name `netlify/functions/redirect.js`, relative to the base directory defined in the configuration file or on the Netlify website.
In the `netlify.toml` configuration file we can also change the default location of the folder containing the functions:

```groovy
[functions]
  directory = "src/netlify/functions"
```

The function will be invokable under the */.netlify/functions/redirect* HTTP path. We can test it by installing and running the test server:

> npm install netlify-cli -g  
> netlify dev --functions src/netlify/functions
> 
> ◈ Functions server is listening on 46867  
> curl http://localhost:46867/.netlify/functions/redirect?state=en-XXXX-XXXX

Now, to connect the redirect with the correct starting location, just add a rewrite entry in the `_redirects` file:

```
/campaign /.netlify/functions/redirect 200
/:lang/* /:lang/index.html 200
```

Using the status of 200, the */campaign* request will be handled by our serverless function without the change of the path in the browser.
This is the so-called rewrite.
Ultimately, the user will be redirected to the SPA application at */en/campaign*. This makes sense if we deploy separate versions of the application
for specific languages.

> **Note:** the serverless functions defined in Netlify are run on the AWS Lambda platform. Currently, those written in JavaScript
> use Node.js 12 runtime.  
> For [full support](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#browser_compatibility) of the presented example,
> you will need to set the `AWS_LAMBDA_JS_RUNTIME` environment parameter to` nodejs14.x` in the Netlify web application.
> Otherwise, you may get surprised by the following error when visiting the redirect function page:
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