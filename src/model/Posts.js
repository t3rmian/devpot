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
      root
    })
  }));
  
  function mapToPostInNeighborhood(post, posts, lng) {
    post = { ...post };
    post.prev = mapToNeighborPost(posts.filter((p) => (p.id == post.id - 1))[0], lng);
    post.next = mapToNeighborPost(posts.filter((p) => (p.id == post.id + 1))[0], lng);
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

}
