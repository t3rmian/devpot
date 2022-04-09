import Footer from "../components/Footer";
import Header from "../components/Header";
import Posts from "../components/Posts";
import React from "react";
import TagCloud from "../components/TagCloud";
import { capitalize } from "../utils.js";
import { useRouteData } from "react-static";
import { useTranslation } from "react-i18next";

export default () => {
  const { t } = useTranslation();
  let {
    posts,
    lang,
    isDefaultLang,
    langRefs,
    category,
    tags,
    root,
    noindex
  } = useRouteData();

  return (
    <div className="container tags-container">
      <div className="page">
        <Header
          root={root}
          seo={{
            title:
              capitalize(t("category", { lng: lang })) +
              " - " +
              t("site title", { lng: lang }),
            description: tags.map(tag => tag.value).join(", "),
            lang,
            type: "website",
            langRefs: langRefs,
            twitterContentUsername: t("twitter author", { lng: lang }),
            twitterCard: "summary",
            noindex
          }}
        />
        <main>
          <h1 className="uppercase subtitle" role="heading" aria-level="1">{t("Posts by category", { category, lng: lang })}</h1>
          <Posts posts={posts} lang={lang} />
        </main>
        <TagCloud isDefaultLang={isDefaultLang} lang={lang} tags={tags} />
        <Footer langRefs={langRefs} lang={lang} />
      </div>
    </div>
  );
};
