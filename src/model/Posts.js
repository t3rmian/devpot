import i18n from "../i18n";
import {Category, RefLang} from "./utils";

export default function Posts(i18nPage) {

  return i18nPage.getPosts().map(post => ({
    path: createRelativePath(post),
    template: "src/containers/Post",
    getData: () => ({
      ...i18nPage.getCommonData(p => p === post),
      post: mapToPostInNeighborhood(post, i18nPage.getPosts(), i18nPage.lang),
      langRefs: RefLang.explode(post, i18nPage, filterMatchingPost, createPath),
      categories: post.category == null ? null : [...post.category]
          .map(categoryLevel => Category.createFromPage(categoryLevel, i18nPage)),
    })
  }));

  function filterMatchingPost(post, lang) {
    return [i18nPage.getPosts(lang).find(p => p.id === post.id)].filter(a => a);
  }

  function mapToPostInNeighborhood(post, posts) {
    const sortedPosts = [...posts].sort((a, b) => a.id - b.id);
    const postIndex = sortedPosts.indexOf(post);
    post = { ...post };
    post.prev = mapToNeighborPost(sortedPosts[postIndex - 1]);
    post.next = mapToNeighborPost(sortedPosts[postIndex + 1]);
    return post;
  }

  function mapToNeighborPost(prev) {
    if (prev !== undefined) {
      return {
        url: i18nPage.getRoot() + createRelativePath(prev),
        title: prev.title,
      };
    }
  }

  function createRelativePath(post, lng = i18nPage.lang) {
    return `${i18n.t("posts", { lng })}/${post.url}/`
  }

  function createPath(post, lng = i18nPage.lang) {
    return `/${createRelativePath(post, lng)}`;
  }

}
