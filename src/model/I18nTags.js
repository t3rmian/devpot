import i18n from "../i18n";
import {SiteLanguageVariant, RefLang} from "./utils";
import {flatMap} from "../utils";

export default function I18nTags(blog, defaultLang) {
    return flatMap(Object.keys(blog), lang => Tags(new SiteLanguageVariant(blog, defaultLang, lang)));
}

export function Tags(siteVariant) {
  const path = siteVariant.getPath("tags");
  const noindex = true;

  return siteVariant.getFlatPostProperties("tags")
    .map(tag => ({
      path: `${path}${tag}`,
      template: "src/containers/Tags",
      getData: () => ({
        ...siteVariant.getExplodedCommonData(post => post.tags != null && post.tags.indexOf(tag) >= 0),
        langRefs: RefLang.explode(tag, siteVariant, filterMatchingTag, tagToPath),
        categories: siteVariant.getCategories(),
        tag,
        noindex
      }),
      noindex
    }));

    function filterMatchingTag(tag, lang) {
        return [siteVariant.getPosts(lang).filter(p => p.tags).flatMap(p => p.tags).find(t => t === tag)].filter(a => a);
    }

    function tagToPath(tag, lng) {
        return `/${i18n.t("tags", { lng })}/${tag}/`;
    }
}
