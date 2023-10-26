import {Index} from "./I18nIndexes";
import {SiteLanguageVariant, RefLang} from "./utils";
import i18n from "../i18n";
import {flatMap} from "../utils";

export default function I18nSearch(blog, defaultLang, home) {
  return flatMap(Object.keys(blog), lang =>
      Search(new SiteLanguageVariant(blog, defaultLang, lang), home)
  );
}

export function Search(siteVariant, home) {
  const noindex = true;
  const search = Index(siteVariant, home, true);
  const data = search.getData();
  search.path = siteVariant.getPath("search", '');
  search.template = "src/containers/Search";
  search.children = undefined;
  search.noindex = noindex;
  search.getData = () => ({
    ...data,
    path: siteVariant.getPath("search", ''),
    langRefs: RefLang.explode(null, siteVariant, (_, lang) => [lang],
        (_, lng) => `/${i18n.t("search", {lng})}`),
    noindex
  });
  return search;
}
