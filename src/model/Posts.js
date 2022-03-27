import i18n from "../i18n";

export default function Posts(blog, defaultLang, lang, tags, root) {
  const isDefaultLang = defaultLang === lang;

  return blog[lang].map(post => ({
    path: createPath(post),
    template: "src/containers/Post",
    getData: () => ({
      post: mapToPostInNeighborhood(post, blog[lang], lang),
      lang,
      isDefaultLang,
      langRefs: [
        ...Object.keys(blog)
          .filter(lng => lng !== defaultLang)
          .filter(lng => blog[lng].some(p => p.id === post.id))
          .map(lng => ({
            lang: lng,
            url: `/${lng}/${i18n.t("posts", { lng: lng })}/${
              blog[lng].find(p => p.id === post.id).url
            }/`,
            selected: lng === lang
          })),
        ...(blog[defaultLang].some(p => p.id === post.id)
          ? [
              {
                lang: defaultLang,
                url: `/${i18n.t("posts", { lng: defaultLang })}/${
                  blog[defaultLang].find(p => p.id === post.id).url
                }/`,
                selected: defaultLang === lang
              }
            ]
          : [])
      ],
      tags,
      root,
      categories: post.category == null ? null : [...post.category]
          .map(categoryLevel => ({key: getCategoryKey(categoryLevel), path: getCategoryPath(getCategoryValue(categoryLevel))})),
    })
  }));

  function getCategoryKey(category) {
    return Object.keys(category)[0];
  }

  function getCategoryValue(category) {
    return category[Object.keys(category)[0]].toLowerCase();
  }

  function mapToPostInNeighborhood(post, posts, lng) {
    const sortedPosts = [...posts].sort((a, b) => a.id - b.id);
    const postIndex = sortedPosts.indexOf(post);
    post = { ...post };
    post.prev = mapToNeighborPost(sortedPosts[postIndex - 1], lng);
    post.next = mapToNeighborPost(sortedPosts[postIndex + 1], lng);
    return post;
  }
  
  function mapToNeighborPost(prev, lng) {
    if (prev !== undefined) {
      return {
        url: (defaultLang === lang ? "/" : `/${lng}/`) + createPath(prev),
        title: prev.title,
      };
    }
  }
  
  function createPath(post) {
    return `${i18n.t("posts", { lng: lang })}/${post.url}/`;
  }

  function getCategoryPath(category) {
    return isDefaultLang
        ? `/${i18n.t("category", {lng: lang})}/${category}/`
        : `/${lang}/${i18n.t("category", {lng: lang})}/${category}/`;
  }
}
