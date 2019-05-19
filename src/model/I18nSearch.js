import Search from "./Search";
import { flatMap } from "../utils";

export default function I18nSearch(blog, defaultLang, home) {
  return flatMap(Object.keys(blog), lang =>
    Search({ blog, home }, defaultLang, lang)
  );
}
