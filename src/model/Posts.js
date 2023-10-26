import i18n from "../i18n";
import {Category, RefLang} from "./utils";

export default function Posts(siteVariant) {

  return siteVariant.getPosts().map(post => ({
    path: createRelativePath(post),
    template: "src/containers/Post",
    getData: () => ({
      ...siteVariant.getCommonData(p => p === post),
      post: mapToPostInNeighborhood(post, siteVariant.getPosts(), siteVariant.lang),
      langRefs: RefLang.explode(post, siteVariant, filterMatchingPost, createPath),
      categories: post.category == null ? null : [...post.category]
          .map(categoryLevel => Category.createFromPage(categoryLevel, siteVariant)),
    })
  }));

  function filterMatchingPost(post, lang) {
    return [siteVariant.getPosts(lang).find(p => p.id === post.id)].filter(a => a);
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
        url: siteVariant.getRoot() + createRelativePath(prev),
        title: prev.title,
      };
    }
  }

  function createPath(post, lng = siteVariant.lang) {
    return `/${createRelativePath(post, lng)}`;
  }

  function createRelativePath(post, lng = siteVariant.lang) {
    return `${i18n.t("posts", { lng })}/${post.url}/`
  }

}
