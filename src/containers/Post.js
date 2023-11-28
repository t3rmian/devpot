import PostHeader from "../components/PostHeader";
import PostFooter from "../components/PostFooter";
import PostJsonLd from "../components/PostJsonLd";
import Comments, { loadComments } from "../components/Comments";
import Footer from "../components/Footer";
// noinspection ES6PreferShortImport
import { Link, navigate } from "../components/Router";
import React from "react";
import SEOHead from "../components/SEOHead";
import SearchBar from "../components/SearchBar";
import Share from "../components/Share";
import TagCloud from "../components/TagCloud";
import convert from "htmr";
import lifecycle from "react-pure-lifecycle";
import { useRouteData } from "react-static";
import { useTranslation } from "../i18n";
import config from "../template.config";
import {
  lazyLoadImages,
  loadHighlight,
} from "../utils";
import { getCommentsTheme, getHighlightTheme } from "../components/Theme";
import hljs from 'highlight.js/lib/core'

const registerLanguage = (name) => {
  const lang = require(`highlight.js/lib/languages/${name}`);
  hljs.registerLanguage(name, lang);
  hljs.configure({ignoreUnescapedHTML : true});
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
    hljs.highlightElement(block);
  });
};

const secureRoutes = () => {
  const isAbsolutePath = /^(?:\/|[a-z]+:\/\/)/;
  [...document.getElementsByTagName("a")]
      .forEach((a) => {
        const hrefAttr = a.getAttribute("href");
        if (a.hostname !== window.location.hostname) {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        } else if (!isAbsolutePath.test(hrefAttr)) {
          if (hrefAttr.startsWith("#")) {
            return;
          }
          a.href = window.location.href.split("/")
              .slice(0, window.location.href.endsWith("/") ? -2 : -1)
              .join("/") + "/" + hrefAttr
          a.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(a.href);
          });
        }
      });
}

const loadAds = () => {
  [].forEach.call(document.querySelectorAll('.ADSENSE'), function (element) {
    const parentElement = element.parentElement;
    if (window.getComputedStyle(parentElement).getPropertyValue("display") === "none"
        || window.getComputedStyle(element).getPropertyValue("display") === "none") {
      element.remove();
    } else {
      element.classList.add("adsbygoogle");
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  });
}

const methods = {
  componentDidMount() {
    updateCodeSyntaxHighlighting();
    lazyLoadImages(document.querySelectorAll(".content img[data-src]"));
    loadHighlight(getHighlightTheme());
    secureRoutes();
    loadComments(config.optional.commentsRepo, "pathname", getCommentsTheme());
    loadAds();
  },
  componentDidUpdate() {
    updateCodeSyntaxHighlighting();
  },
};

const injectAds = (htmlString) => {
  let indexes = []
  let nextIndex = htmlString.indexOf("</p>\n<p>");
  while (nextIndex > 0) {
    indexes.push(nextIndex)
    nextIndex = htmlString.indexOf("</p>\n<p>", nextIndex + 1);
  }
  if (indexes.length === 0) {
    return htmlString;
  }
  nextIndex = indexes[Math.floor(indexes.length / 2)];
  const ads = `<ins class="ADSENSE"
     style="display:block; text-align:center;"
     data-ad-layout="in-article"
     data-ad-format="fluid"
     data-ad-client="ca-pub-2634621437118444"
     data-ad-slot="5317020259"></ins>`;
  return htmlString.substring(0, nextIndex + 4)
      + ads +
      htmlString.substring(nextIndex + 4, htmlString.length);
}

export function Post() {
  const { post, isDefaultLang, lang, langRefs, tags, root, categories } = useRouteData();
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
    : config.authorPictureSeo;
  const author = post.author ? post.author : config.author;

  return (
    <div className="container post-container">
      <aside>
        <ins className="ADSENSE"
             style="display:block"
             data-ad-format="autorelaxed"
             data-ad-client="ca-pub-2634621437118444"
             data-ad-slot="4074638071"></ins>
      </aside>
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
          ads={true}
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
              routeCategories={categories}
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
              {convert(injectAds(post.contents))}
              <PostFooter
                prev={post.prev}
                source={
                  post.source !== undefined
                    ? { url: post.source, title: t("source", { lng: lang }) }
                    : undefined
                }
                next={post.next}
              />
            </div>
          </article>
        </main>
        <TagCloud isDefaultLang={isDefaultLang} lang={lang}
                  tags={tags}/>
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
      <aside></aside>
    </div>
  );
}

export default lifecycle(methods)(Post);
