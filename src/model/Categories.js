import {Blog, Category, RefLang} from "./utils";
import i18n from "../i18n";

export default function Categories(i18nPage) {
  const path =  i18nPage.getPath("category");
  const noindex = true;

  return i18nPage.getFlatPostProperties("category")
    .map(categoryLevel => ({
      path: `${path}${Category.getNormalizedValue(categoryLevel)}`,
      template: "src/containers/Category",
      getData: () => ({
        ...i18nPage.getCommonData(p => Category.containsCategory(p, categoryLevel)),
        langRefs: RefLang.explode(categoryLevel, i18nPage, filterMatchingCategory, categoryToPath),
        category: Category.getValue(categoryLevel),
        noindex
      }),
      noindex
    }));

    function filterMatchingCategory(categoryLevel, lang) {
        return Blog.getTranslatedCategories(i18nPage.getPosts(lang), categoryLevel);
    }

    function categoryToPath(category, lng) {
        return `/${i18n.t("category", {lng})}/${Category.getNormalizedValue(category)}/`;
    }

}
