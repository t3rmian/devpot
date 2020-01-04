import i18n from "../i18n";

export default function Posts(blog, defaultLang, lang, tags, root) {
  const isDefaultLang = defaultLang === lang;

  return blog[lang].map(post => ({
    path: `${i18n.t("posts", { lng: lang })}/${post.url}`,
    template: "src/containers/Post",
    getData: () => ({
      post,
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
}
