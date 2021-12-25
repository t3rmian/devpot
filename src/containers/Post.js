import PostHeader from "../components/PostHeader";
import PostFooter from "../components/PostFooter";
import PostJsonLd from "../components/PostJsonLd";
import Comments, { loadComments } from "../components/Comments";
import Footer from "../components/Footer";
import { Link } from "components/Router";
import React from "react";
import SEOHead from "../components/SEOHead";
import SearchBar from "../components/SearchBar";
import Share from "../components/Share";
import TagCloud from "../components/TagCloud";
import convert from "htmr";
import lifecycle from "react-pure-lifecycle";
import { useRouteData } from "react-static";
import { useTranslation } from "react-i18next";
import config from "../template.config";
import {
  lazyLoadImages,
  loadHighlight,
} from "../utils";
import { getCommentsTheme, getHighlightTheme } from "../components/Theme";
import hljs from "highlight.js/lib/highlight";

const registerLanguage = (name) => {
  const lang = require(`highlight.js/lib/languages/${name}`);
  hljs.registerLanguage(name, lang);
};

[
  "kotlin",
  "properties",
  "plaintext",
  "yaml",
  "groovy",
  "sql",
  "gradle",
  "bash",
  "dockerfile",
  "xml",
  "java",
  "javascript",
].forEach(registerLanguage);

const updateCodeSyntaxHighlighting = () => {
  document.querySelectorAll("pre code").forEach((block) => {
    const languageClass = [].slice
      .call(block.classList)
      .find((c) => c.indexOf("language-") >= 0);
    if (languageClass !== undefined) {
      block.parentElement.classList.add(languageClass.split("-")[1]);
    }
    hljs.highlightBlock(block);
  });
};

const methods = {
  componentDidMount() {
    updateCodeSyntaxHighlighting();
    lazyLoadImages(document.querySelectorAll(".content img[data-src]"));
    loadHighlight(getHighlightTheme());
    [...document.getElementsByTagName("a")]
      .filter((a) => a.hostname !== window.location.hostname)
      .forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
    loadComments(config.optional.commentsRepo, "pathname", getCommentsTheme());
  },
  componentDidUpdate() {
    updateCodeSyntaxHighlighting();
  },
};

export function Post() {
  const { post, isDefaultLang, lang, langRefs, tags, root } = useRouteData();
  const { t } = useTranslation();
  const authorLang = isDefaultLang ? "/" : "/" + lang + "/";
  const authorSite = post.authorSite
    ? post.authorSite
    : config.authorSite + authorLang;
  const authorPicture = post.authorPicture
    ? post.authorPicture
    : config.authorPicture;
  const authorPictureSeo = post.authorPicture
    ? post.authorPicture
    : "https://avatars.githubusercontent.com/u/20327242";
  const author = post.author ? post.author : config.author;

  return (
    <div className="container post-container">
      <div className="page">
        <SEOHead
          title={post.title}
          description={post.contents}
          lang={lang}
          type="article"
          langRefs={langRefs}
          image={post.imageUrl}
          date={(post.updated
            ? new Date(post.updated)
            : new Date(post.date)
          ).toISOString()}
          twitterContentUsername={
            post.twitterAuthor
              ? post.twitterAuthor
              : t("twitter author", { lng: lang })
          }
          twitterCard="summary"
          jsonLd={JSON.stringify(PostJsonLd(post, authorPictureSeo))}
        />
        <header>
          <Link className="post-logo fadeIn" to={root}>
            <img src="/img/logo.png" alt="Logo" />
          </Link>
          <SearchBar root={root} lang={lang} />
        </header>
        <main aria-label={t("Article", { lng: lang })}>
          <article>
            <PostHeader
              {...post}
              routeTags={tags}
              authorAlt={t("Author", { lng: lang })}
              author={author}
              authorSite={authorSite}
              authorPicture={authorPicture}
              dateFormatted={t("date=post", {
                date: new Date(post.date),
                lng: lang,
              })}
              updatedFormatted={
                post.updated &&
                t("date=post", {
                  date: new Date(post.updated),
                  lng: lang,
                })
              }
              minutesRead={t("count minutes read", {
                count: post.minutesRead,
                lng: lang,
              })}
            />
            <div className="content">
              {convert(post.contents)}
              <PostFooter
                prev={post.prev}
                source={
                  post.source != undefined
                    ? { url: post.source, title: t("source", { lng: lang }) }
                    : undefined
                }
                next={post.next}
              />
            </div>
          </article>
        </main>
        <TagCloud isDefaultLang={isDefaultLang} lang={lang} tags={tags} />
        <Share
          siteTitle={t("site title", { lng: lang })}
          langRefs={langRefs}
          description={post.contents}
          title={post.title}
          tags={post.tags}
          twitterAuthor={t("twitter author", { lng: lang })}
          twitterContentUsername={post.twitterAuthor}
        />
        <Comments/>
        <SearchBar root={root} lang={lang} />
        <Footer langRefs={langRefs} lang={lang} />
      </div>
    </div>
  );
}

export default lifecycle(methods)(Post);
