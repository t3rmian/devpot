import { flatMap } from "../utils";
import { gradeTags, mapPost } from "./Index";
import i18n from "../i18n";

export default function Category(blog, defaultLang, lang) {
  const isDefaultLang = defaultLang === lang;
  const root = isDefaultLang ? "/" : `/${lang}/`;
  const path = `${root}${i18n.t("category", { lng: lang })}/`;
  const postPath = `${root}${i18n.t("posts", { lng: lang })}/`;
  const categories = [...new Set(flatMap(blog[lang], post => post.category))];
  const pageTags = gradeTags(blog, defaultLang === lang, lang);
  const noindex = true;

  return categories
    .filter(category => category != null)
    .map(category => ({
      path: `${path}${getCategoryValue(category)}`,
      template: "src/containers/Category",
      getData: () => ({
        posts: blog[lang]
          .filter(p => postInCategory(p, category))
          .map(p => ({
            ...mapPost(p),
            path: `${postPath}${p.url}`
          })),
        lang,
        isDefaultLang,
        langRefs: [
          ...Object.keys(blog)
            .filter(lng => lng !== defaultLang)
            .map(lng => ({lng, category: blog[lng].flatMap(p => p.category).find(c => categoryInCategory(c, category))}))
            .filter(lngCat => lngCat.category != null)
            .map(({lng, category}) => ({
              lang: lng,
              url: `/${lng}/${i18n.t("category", { lng })}/${getCategoryValue(category)}/`,
              selected: lng === lang
            })),
          ...[blog[defaultLang].flatMap(p => p.category).find(p => categoryInCategory(p, category))].filter(c => c != null).map(category => (
                {
                  lang: defaultLang,
                  url: `/${i18n.t("category", { lng: defaultLang })}/${getCategoryValue(category)}/`,
                  selected: defaultLang === lang
                }
          ))
        ],
        category: getCategoryValue(category),
        tags: pageTags,
        root,
        noindex
      }),
      noindex
    }));

  function getCategoryKey(category) {
      return category == null ? null : Object.keys(category)[0];
  }

  function getCategoryValue(category) {
      return category[Object.keys(category)[0]].toLowerCase();
  }

  function postInCategory(p, category) {
      return p.category == null ? false : p.category.some(c => categoryInCategory(c, category));
  }

  function categoryInCategory(category1, category2) {
      return getCategoryKey(category1) === getCategoryKey(category2)
  }
}
