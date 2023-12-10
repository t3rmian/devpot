import React from "react";

export default function Comment() {
    return (
        <div role="complementary" id="comments">
            <div className="utterances fadeIn">
                <iframe className="utterances-frame" title="Comments" scrolling="no" loading="lazy"></iframe>
            </div>
        </div>
    )
}

export function loadComments(repo, issueTerm, theme) {
    if (repo == null) {
        return;
    }
    var d = {}, b = {};

    function l(e) {
        for (var r, o = /\+/g, n = /([^&=]+)=?([^&]*)/g, p = function (e) {
            return decodeURIComponent(e.replace(o, " "))
        }, a = {}; r = n.exec(e);) a[p(r[1])] = p(r[2]);
        return a
    }

    function g(e) {
        var r = [];
        for (var o in e) e.hasOwnProperty(o) && e[o] && r.push(encodeURIComponent(o) + "=" + encodeURIComponent(e[o]));
        return r.join("&")
    }

    d.deparam = l, d.param = g;
    var f = {},
        m = window.matchMedia("(prefers-color-scheme: dark)").matches ? "github-dark" : "github-light";
    f.preferredTheme = m;
    var q = "preferred-color-scheme";
    f.preferredThemeId = q;
    var h = l(location.search.substr(1)),
        i = h.utterances;
    if (i) {
        localStorage.setItem("utterances-session", i), delete h.utterances;
        var j = g(h);
        j.length && (j = "?" + j), history.replaceState(void 0, document.title, location.pathname + j + location.hash)
    }
    b['repo'] = repo;
    b['issue-term'] = issueTerm;
    b['theme'] = theme;
    b.theme === q && (b.theme = m);
    var u = document.querySelector("link[rel='canonical']");
    b.url = u ? u.href : location.origin + location.pathname + location.search, b.origin = location.origin, b.pathname = location.pathname.length < 2 ? "index" : location.pathname.substr(1).replace(/\.\w+$/, ""), b.title = document.title;
    var v = document.querySelector("meta[name='description']");
    b.description = v ? v.content : "";
    var w = encodeURIComponent(b.description).length;
    w > 1e3 && (b.description = b.description.substr(0, Math.floor(1e3 * b.description.length / w)));
    var x = document.querySelector("meta[property='og:title'],meta[name='og:title']");
    b["og:title"] = x ? x.content : "", b.session = i || localStorage.getItem("utterances-session") || "";
    var y = "https://utteranc.es",
        z = y + "/utterances.html";
    var A = document.querySelector("#comments iframe")
    A.src = z + "?" + g(b);
    addEventListener("message", function (t) {
        if (t.origin === y) {
            var r = t.data;
            r && "resize" === r.type && r.height && (A.style.height = r.height + "px")
            && (A.parentElement.style.height = r.height + "px") && (A.parentElement.parentElement.style.height = r.height + "px")
        }
    });
}
