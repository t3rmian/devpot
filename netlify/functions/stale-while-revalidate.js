exports.handler = async function (event) {
    const lang = event.headers['accept-language'] || 'en'
    return {
        statusCode: 200,
        headers: {
            "Cache-Control": "max-age=1, stale-while-revalidate=60",
            "Access-Control-Allow-Origin": "*",
            "X-Robots-Tag": "noindex",
        },
        body: lang.includes("de") ? "Hallo Welt!" : lang.includes("pl") ? "Witaj Świecie!" : "Hello World!",
    };
}