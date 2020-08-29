import { capitalize, countSubstrings } from "../utils.js";

import Footer from "../components/Footer";
import Header from "../components/Header";
import Posts from "../components/Posts";
import React from "react";
import TagCloud from "../components/TagCloud";
import { useRouteData } from "react-static";
import { useTranslation } from "react-i18next";

export default function Search() {
  const { t } = useTranslation();

  let {
    home,
    posts,
    lang,
    isDefaultLang,
    langRefs,
    tags,
    root,
    path,
    noindex
  } = useRouteData();
  const url = typeof window !== "undefined" ? window.location.href : path;

  const query = "?q=" + url.split(/\?q=/).slice(1).join("?q=");
  langRefs = langRefs.map(lr => ({
    ...lr,
    url: lr.url + query
  }));
  const words = decodeURIComponent(query)
    .replace(/[.,]/g, " ")
    .replace(/\s\s+/g, " ")
    .replace(/\?q=/, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  const matchingPosts = posts
    .map(post => gradePost(post))
    .filter(post => post.score > 0)
    .sort((a, b) => b.score - a.score);

  let header;
  if (words.length > 0) {
    header = t("Search results", {
      parts: " " + words.map(word => '"' + word + '"').join(", "),
      lng: lang
    });
  } else {
    header = t("Empty query", { lng: lang });
  }

  let content;
  if (matchingPosts.length > 0) {
    content = <Posts posts={matchingPosts} lang={lang} />;
  } else {
    content = <div>{t("No content", { lng: lang })}</div>;
  }
  return (
    <div className="container search-container">
      <div className="page">
        <Header
          root={root}
          seo={{
            title:
              capitalize(t("search", { lng: lang })) +
              " - " +
              t("site title", { lng: lang }),
            description: home.contents,
            lang,
            type: "website",
            langRefs: langRefs,
            twitterContentUsername: t("twitter author", { lng: lang }),
            twitterCard: "summary",
            noindex
          }}
        />
        <main>
        <h1 className="search-header subtitle" role="heading" aria-level="1">{header}</h1>
        {content}
        </main>
        <TagCloud isDefaultLang={isDefaultLang} lang={lang} tags={tags} />
        <Footer langRefs={langRefs} lang={lang} />
      </div>
    </div>
  );

  function gradePost(post) {
    const titleHits = words
      .map(word => countSubstrings(post.title, word))
      .reduce((a, b) => a + b, 0);
    const tagHits = words
      .map(word =>
        post.tags != null ? countSubstrings(post.tags.join(" "), word) : 0
      )
      .reduce((a, b) => a + b, 0);
    const contentHits = words
      .map(word => countSubstrings(post.contents, word))
      .reduce((a, b) => a + b, 0);
    return {
      ...post,
      titleHits,
      tagHits,
      contentHits,
      score: Math.pow(titleHits, 3) + Math.pow(tagHits, 2) + contentHits
    };
  }
}
