exports.handler = async function (event) {
    const lang = event.headers['accept-language'] || 'en'
    const errorOut = event.headers['x-end-in-error']
    const vary = event['queryStringParameters'].vary
    const response = {
        statusCode: 200,
        headers: {
            "Cache-Control": "max-age=1, stale-while-revalidate=60",
            "Access-Control-Allow-Origin": "*",
            "X-Robots-Tag": "noindex",
        },
        body: (lang === "de" ? "Hallo Welt!" : lang === "pl" ? "Witaj Świecie!" : "Hello World!" ) + " " + new Date().getTime(),
    };
    if (vary) {
        response.headers["Vary"] = "Accept-Language";
    }
    if (errorOut) {
        response.statusCode = 500
    }
    return response;
}