import i18n from "../i18n";
import {RefLang} from "./utils";

export default function Tags(i18nPage) {
  const path = i18nPage.getPath("tags");
  const noindex = true;

  return i18nPage.getFlatPostProperties("tags")
    .map(tag => ({
      path: `${path}${tag}`,
      template: "src/containers/Tags",
      getData: () => ({
        ...i18nPage.getCommonData(post => post.tags != null && post.tags.indexOf(tag) >= 0),
        langRefs: RefLang.explode(tag, i18nPage, filterMatchingTag, tagToPath),
        tag,
        noindex
      }),
      noindex
    }));

    function filterMatchingTag(tag, lang) {
        return [i18nPage.getPosts(lang).filter(p => p.tags).flatMap(p => p.tags).find(t => t === tag)].filter(a => a);
    }

    function tagToPath(tag, lng) {
        return `/${i18n.t("tags", { lng })}/${tag}/`;
    }
}
