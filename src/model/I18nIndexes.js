import Index from "../model/Index";

export default function I18nIndexes(blog, defaultLang, home) {
  return Object.keys(blog).map(lang =>
    Index({ blog, home }, defaultLang, lang)
  );
}
