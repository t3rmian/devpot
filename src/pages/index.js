import React, { useState } from "react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import Posts from "../components/Posts";
import TagCloud from "../components/TagCloud";
import { useRouteData } from "react-static";
import { useTranslation } from "react-i18next";

export default () => {
  const { t } = useTranslation();
  let {
    home,
    posts,
    lang,
    date,
    isDefaultLang,
    langRefs,
    tags,
    root
  } = useRouteData();
  const [expanded, setExpanded] = useState(
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("expanded")
        ? true
        : false
      : false
  );
  posts.sort(function(a, b) {
    return new Date(b.date) - new Date(a.date);
  });
  const expandFromIndex = 3;
  if (!expanded) {
    if (posts.length < expandFromIndex) {
      expanded = true
    }
    posts = posts.slice(0, expandFromIndex);
  } else {
    for (let i = expandFromIndex; i < posts.length; i++) {
      posts[i].expanded = true;
    }
  }

  return (
    <div className="container index-container">
      <div className="page">
        <Header
          home={{ ...home, siteTitle: t("site title", { lng: lang }) }}
          root={root}
          seo={{
            title: t("site title", { lng: lang }) + ": " + home.title,
            description: home.contents,
            lang,
            date,
            type: "website",
            langRefs: langRefs,
            twitterContentUsername: t("twitter author", { lng: lang }),
            twitterCard: "summary"
          }}
        />
        <main>
          <h2 className="uppercase">{t("Recent", { lng: lang })}</h2>
          <Posts posts={posts} lang={lang} />
          {!expanded && (
            <div className="more">
              <button
                className="link"
                onClick={() => {
                  window.sessionStorage.setItem("expanded", true);
                  setExpanded(true);
                }}
              >
                {t("More", { lng: lang })}
              </button>
            </div>
          )}
        </main>
        <TagCloud isDefaultLang={isDefaultLang} lang={lang} tags={tags} />
        <Footer langRefs={langRefs} />
      </div>
    </div>
  );
};
