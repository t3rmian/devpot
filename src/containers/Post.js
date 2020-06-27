import PostFooter from "../components/PostFooter";
import PostHeader from "../components/PostHeader";
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
  loadComments,
  loadHighlight,
  countPostMinutes,
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
  "shell",
  "plaintext",
  "yaml",
  "groovy",
  "sql",
  "gradle",
  "bash",
  "xml",
  "java",
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
    if (config.optional.commentsRepo) {
      loadComments(
        document.getElementById("comments"),
        config.optional.commentsRepo,
        getCommentsTheme()
      );
      loadHighlight(getHighlightTheme());
    }
    [...document.getElementsByTagName("a")]
      .filter((a) => a.hostname !== window.location.hostname)
      .forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
  },
  componentDidUpdate() {
    updateCodeSyntaxHighlighting();
  },
};

export function Post() {
  const { post, isDefaultLang, lang, langRefs, tags, root } = useRouteData();
  const { t } = useTranslation();
  const minutesRead = countPostMinutes(post);
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
  const authorLang = isDefaultLang ? "/" : "/" + lang + "/";
  const authorSite = post.authorSite
    ? post.authorSite
    : config.authorSite + authorLang;
  const authorPicture = post.authorPicture
    ? post.authorPicture
    : config.authorPicture;
  const author = post.author ? post.author : config.author;

  return (
    <div className="container post-container">
      <div className="page">
        <SEOHead
          title={post.title + " - " + t("site title", { lng: lang })}
          description={post.contents}
          lang={lang}
          type="article"
          langRefs={langRefs}
          image={imageUrl}
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
                count: minutesRead,
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
          title={post.title + " - " + t("site title", { lng: lang })}
          tags={post.tags}
          twitterAuthor={t("twitter author", { lng: lang })}
          twitterContentUsername={post.twitterAuthor}
        />
        <div id="comments" role="complementary" />
        <SearchBar root={root} lang={lang} />
        <Footer langRefs={langRefs} lang={lang} />
      </div>
    </div>
  );
}

export default lifecycle(methods)(Post);
