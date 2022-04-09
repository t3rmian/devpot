import {Blog, Category, I18nPage, RefLang} from "./utils";
import i18n from "../i18n";
import {flatMap} from "../utils";

export default function I18nCategories(blog, defaultLang) {
    return flatMap(Object.keys(blog), lang => Categories(new I18nPage(blog, defaultLang, lang)));
}

export function Categories(i18nPage) {
    const path = i18nPage.getPath("category");
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
