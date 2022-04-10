import Posts from "./Posts";
import {Category, I18nPage, RefLang} from "./utils";

export default function I18nIndexes(blog, defaultLang, home) {
    return Object.keys(blog).map(lang =>
        Index(new I18nPage(blog, defaultLang, lang), home)
    );
}

export function Index(i18nPage, home, loadEagerly) {
  const categories = i18nPage.getFlatPostProperties("category")
      .map(categoryLevel => Category.createFromPageWithValue(categoryLevel, i18nPage))
      .sort((a, b) => a.value.localeCompare(b.value));

  return {
    path: i18nPage.getRoot(),
    template: "src/pages/index",
    getData: () => ({
      ...i18nPage.getCommonData(null, loadEagerly),
      home: home[i18nPage.lang][0],
      langRefs: RefLang.explode(null, i18nPage, (_, lang) => [lang], () => "/"),
      categories,
      date: new Date().toISOString()
    }),
    children: Posts(i18nPage)
  };

}