import I18nIndexes from "./src/model/I18nIndexes";
import I18nSearch from "./src/model/I18nSearch";
import I18nTags from "./src/model/I18nTags";
import I18nCategories from "./src/model/I18nCategories";
import React from "react";
import config, { isPreview } from "./src/template.config";
import jdown from "jdown";
import path from "path";
import chokidar from "chokidar";
import { rebuildRoutes } from "react-static/node";
import { timeToLength } from "./src/model/Length";
import { countPostMinutes } from "./src/utils";
import i18n from "./src/i18n";

let devMode = isPreview();
if (process.env.NODE_ENV === "development") {
  devMode = true;
  chokidar.watch(["content", "sass"], { ignoreInitial: true })
        .on("all", (path) => { rebuildRoutes(); })
}

export default {
  disablePreload: true,
  siteRoot: config.siteRoot,
  getSiteData: () => ({
    siteRoot: config.siteRoot
  }),
  getRoutes: async () => {
    const blog = await jdown("content/posts", { fileInfo: true });
    const home = await jdown("content/home", { fileInfo: true });
    Object.keys(blog).forEach(lang => {
      if (blog[lang].filter(post => !post.id).map(p => console.log("Missing post id: " + p.title)).length) {
        console.warn("Some posts have missing ids. Please check.");
      }
      blog[lang] = blog[lang].filter(post => post.id);
      blog[lang].forEach(post => {
        post.devMode = devMode;
        const minutes = countPostMinutes(post);
        const length = timeToLength(minutes)
        post.minutesRead = minutes
        post.tags.push(i18n.t(length, {lng: lang}));
        const hqImgRegex = /data-src=\"(.*?)\"/gi;
        const lazyImgRegex = /src=\"(.*?)\"/gi;
        let imageUrl =
            hqImgRegex.exec(post.contents) != null
                ? RegExp.$1
                : lazyImgRegex.exec(post.contents) != null
                ? RegExp.$1
                : null;
        if (imageUrl != null && imageUrl.endsWith(".svg")) {
          imageUrl = imageUrl.substring(0, imageUrl.length - 3) + "jpeg"
        }
        post.imageUrl = imageUrl
      });
      blog[lang].sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
      })
    });
    return [
      ...I18nIndexes(blog, config.defaultLanguage, home),
      ...I18nTags(blog, config.defaultLanguage),
      ...I18nCategories(blog, config.defaultLanguage),
      ...I18nSearch(blog, config.defaultLanguage, home)
    ];
  },
  plugins: [
    [
      require.resolve("react-static-plugin-source-filesystem"),
      {
        location: path.resolve("./src/pages").replace(/\\/g, "/")
      }
    ],
    require.resolve("react-static-plugin-preact"),
    require.resolve("react-static-plugin-reach-router"),
    [
      require.resolve("react-static-plugin-sitemap"),
      {
        getAttributes: route => {
          const attributes = {};
          const data = route.getData();
          if (data.post) {
            if (data.post.updated) {
              attributes.lastmod = new Date(data.post.updated).toISOString();
            } else if (data.post.date) {
              attributes.lastmod = new Date(data.post.date).toISOString();
            }
          } else if (data.date) {
            attributes.lastmod = data.date;
          }

          data.langRefs.map(ref => {
            const key = `xhtml:link rel="alternate" hreflang="${
              ref.lang
            }" href="${config.siteRoot}${ref.url}"`;
            attributes[key] = "";
            if (ref.lang === config.defaultLanguage) {
              const defaultKey = `xhtml:link rel="alternate" hreflang="x-default" href="${
                config.siteRoot
              }${ref.url}"`;
              attributes[defaultKey] = "";
            }
          });
          return attributes;
        }
      }
    ],
    require.resolve("react-static-plugin-sass")
  ],
  Document: ({ Html, Head, Body, children }) => {
    return (
      <Html lang="x-default">
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png"
          />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#b91d47" />
          <meta name="msapplication-TileColor" content="#b91d47" />
          <meta name="theme-color" content="#ffffff" />
          <link rel="preconnect" href="https://fonts.gstatic.com/" crossOrigin="true" />
          <link rel="preload" as="style" href="https://fonts.googleapis.com/css?family=Black+Ops+One|Montserrat|Raleway&display=swap" />
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Black+Ops+One|Montserrat|Raleway&display=swap" />
          <link rel="preload" as="image" href="/img/logo.png" />
          <script type="text/javascript" dangerouslySetInnerHTML={{__html: `
            if ("serviceWorker" in navigator) {
              window.addEventListener("load", function() {
                if (!navigator.serviceWorker.controller) {
                  navigator.serviceWorker.register("/pwabuilder-sw.js", {
                    scope: "/"
                  });
                }
              });
            }`.replace(/\s{2,}/g,'')}}>
          </script>
          {config.optional.ga && (
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${config.optional.ga}`}
            />
          )}
        </Head>
        <Body>
          <noscript>
            <div>
              Please enable JavaScript to make the website fully functional.
            </div>
          </noscript>
          {children}
        </Body>
      </Html>
    );
  }
};
