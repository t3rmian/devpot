import Posts from "./Posts";
import {Category, I18nPage, RefLang} from "./utils";

export default function I18nIndexes(blog, defaultLang, home) {
    return Object.keys(blog).map(lang =>
        Index(new I18nPage(blog, defaultLang, lang), home, false)
    );
}

export function Index(i18nPage, home, loadEagerly) {
  return {
    path: i18nPage.getRoot(),
    template: "src/pages/index",
    getData: () => ({
      ...i18nPage.getExplodedCommonData(undefined, loadEagerly),
      home: home[i18nPage.lang][0],
      langRefs: RefLang.explode(null, i18nPage, (_, lang) => [lang], () => "/"),
      categories: i18nPage.getCategories(),
      date: new Date().toISOString()
    }),
    children: Posts(i18nPage)
  };

}