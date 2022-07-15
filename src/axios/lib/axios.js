'use strict';

var axios = {
    get: (path) => {
        return fetch(path, {
            method: "GET",
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        })
            .then(response => response.json())
            .then(data => ({data}));
    }
}

module.exports = axios;
// Allow use of default import syntax in TypeScript
module.exports.default = axios;
