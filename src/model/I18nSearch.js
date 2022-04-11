import {Index} from "./I18nIndexes";
import {I18nPage, RefLang} from "./utils";
import i18n from "../i18n";
import {flatMap} from "../utils";

export default function I18nSearch(blog, defaultLang, home) {
  return flatMap(Object.keys(blog), lang =>
      Search(new I18nPage(blog, defaultLang, lang), home)
  );
}

export function Search(i18nPage, home) {
  const noindex = true;
  const search = Index(i18nPage, home, true);
  const data = search.getData();
  search.path = i18nPage.getPath("search", '');
  search.template = "src/containers/Search";
  search.children = undefined;
  search.noindex = noindex;
  search.getData = () => ({
    ...data,
    langRefs: RefLang.explode(null, i18nPage, (_, lang) => [lang],
        (_, lng) => `/${i18n.t("search", {lng})}`),
    noindex
  });
  return search;
}
