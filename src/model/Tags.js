import { flatMap } from "../utils";
import { gradeTags } from "./Index";
import i18n from "../i18n";

export default function Tags(blog, defaultLang, lang) {
  const isDefaultLang = defaultLang === lang;
  const root = isDefaultLang ? "/" : `/${lang}/`;
  const path = `${root}${i18n.t("tags", { lng: lang })}/`;
  const postPath = `${root}${i18n.t("posts", { lng: lang })}/`;
  const tags = [...new Set(flatMap(blog[lang], post => post.tags))];
  const pageTags = gradeTags(blog, defaultLang === lang, lang);
  const noindex = true;

  return tags
    .filter(tag => tag != null)
    .map(tag => ({
      path: `${path}${tag}`,
      template: "src/containers/Tags",
      getData: () => ({
        posts: blog[lang]
          .filter(post => post.tags != null && post.tags.indexOf(tag) >= 0)
          .map(p => ({
            ...p,
            path: `${postPath}${p.url}`
          })),
        lang,
        isDefaultLang,
        langRefs: [
          ...Object.keys(blog)
            .filter(lng => lng !== defaultLang)
            .filter(lng =>
              blog[lng].some(p =>
                p.tags != null ? p.tags.some(t => t === tag) : false
              )
            )
            .map(lng => ({
              lang: lng,
              url: `/${lng}/${i18n.t("tags", { lng })}/${tag}`,
              selected: lng === lang
            })),
          ...(blog[defaultLang].some(p =>
            p.tags != null ? p.tags.some(t => t === tag) : false
          )
            ? [
                {
                  lang: defaultLang,
                  url: `/${i18n.t("tags", { lng: defaultLang })}/${tag}`,
                  selected: defaultLang === lang
                }
              ]
            : [])
        ],
        tag,
        tags: pageTags,
        root,
        noindex
      }),
      noindex
    }));
}
