import I18nIndexes from "./src/model/I18nIndexes";
import I18nSearch from "./src/model/I18nSearch";
import I18nTags from "./src/model/I18nTags";
import React from "react";
import config from "./src/template.config";
import jdown from "jdown";
import path from "path";
import chokidar from "chokidar";
import { rebuildRoutes } from "react-static/node";
import { timeToLength } from "./src/model/Length";
import { countPostMinutes } from "./src/utils";
import i18n from "./src/i18n";

let devMode = undefined;
if (process.env.NODE_ENV === "development") {
  devMode = true;
  chokidar.watch(["content", "sass"], { ignoreInitial: true })
        .on("all", (path) => { rebuildRoutes(); })
}

export default {
  siteRoot: config.siteRoot,
  getSiteData: () => ({
    siteRoot: config.siteRoot
  }),
  getRoutes: async () => {
    const blog = await jdown("content/posts", { fileInfo: true });
    const home = await jdown("content/home", { fileInfo: true });
    Object.keys(blog).forEach(lang => {
      if (blog[lang].filter(post => post.id).length) { 
        console.warn("Some posts have missing ids. Please check.");
      }
      blog[lang] = blog[lang].filter(post => post.id);
      blog[lang].forEach(post => {
        post.devMode = devMode;
        const minutes = countPostMinutes(post);
        const length = timeToLength(minutes)
        post.tags.push(i18n.t(length, {lng: lang}));
      });
      blog[lang].sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
      })
    });
    return [
      ...I18nIndexes(blog, config.defaultLanguage, home),
      ...I18nTags(blog, config.defaultLanguage),
      ...I18nSearch(blog, config.defaultLanguage, home),
      {
        path: "offline",
        noindex: true
      }
    ];
  },
  plugins: [
    [
      require.resolve("react-static-plugin-source-filesystem"),
      {
        location: path.resolve("./src/pages").replace(/\\/g, "/")
      }
    ],
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
          <script src="/pwabuilder-sw-register.js" />
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
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#b91d47" />
          <meta name="msapplication-TileColor" content="#b91d47" />
          <meta name="theme-color" content="#ffffff" />
          {config.optional.ga && (
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${config.optional.ga}`}
            />
          )}
        </Head>
        <Body>
          <noscript>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)"
              }}
            >
              Please enable JavaScript to view the website
            </div>
          </noscript>
          {children}
        </Body>
      </Html>
    );
  }
};
