import Index from "./Index";
import i18n from "../i18n";

export default function Search(content, defaultLang, lang) {
  const search = Index(content, defaultLang, lang);
  const { blog } = content;
  const isDefaultLang = defaultLang === lang;
  const path = isDefaultLang
    ? `/${i18n.t("search", { lng: lang })}`
    : `/${lang}/${i18n.t("search", { lng: lang })}`;
  const noindex = true;

  search.path = path;
  search.template = "src/containers/Search";
  search.children = undefined;
  search.noindex = noindex;
  
  const data = search.getData();
  data.langRefs = [
    ...Object.keys(blog)
      .filter(lng => lng !== defaultLang)
      .map(lng => ({
        lang: lng,
        url: `/${lng}/${i18n.t("search", { lng })}`,
        selected: lng === lang
      })),
    {
      lang: defaultLang,
      url: `/${i18n.t("search", { lng: defaultLang })}`,
      selected: defaultLang === lang
    }
  ];
  search.getData = () => ({
    ...data,
    path,
    noindex
  });
  return search;
}
