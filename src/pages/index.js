import React, { useState } from "react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import Posts from "../components/Posts";
import TagCloud from "../components/TagCloud";
import { useRouteData } from "react-static";
import { useTranslation } from "../i18n";
import PostJsonLd from "../components/PostJsonLd";

export default () => {
  const { t } = useTranslation();
  const expandFromIndex = 10;
  let {
    home,
    privacyPolicy,
    posts,
    lang,
    date,
    isDefaultLang,
    langRefs,
    tags,
    root,
    categories,
  } = useRouteData();
  const [expanded, setExpanded] = useState(
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("expanded")
        ? true
        : posts.length <= expandFromIndex
      : posts.length <= expandFromIndex
  );

  const siteTitleI18n = t("site title", {lng: lang});
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "headline": siteTitleI18n,
    "image": "/img/logo.png",
    "text": home.contents.replace(/<[^>]*>?/gm, ''),
    "blogPost": [...posts.map(post => PostJsonLd(post, "https://avatars.githubusercontent.com/u/20327242"))]
  }

  if (!expanded) {
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
          home={{ ...home, siteTitleI18n }}
          root={root}
          categories={categories}
          seo={{
            title: t("site title", { lng: lang }) + ": " + home.title,
            description: home.contents,
            lang,
            date,
            type: "website",
            langRefs: langRefs,
            twitterContentUsername: t("twitter author", { lng: lang }),
            twitterCard: "summary",
            jsonLd: JSON.stringify(jsonLd)
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
        <TagCloud isDefaultLang={isDefaultLang} lang={lang} tags={tags} limited={true} />
        <Footer langRefs={langRefs} lang={lang} privacyPolicy={privacyPolicy} />
      </div>
    </div>
  );
};
