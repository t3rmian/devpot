import Posts from "../model/Posts";
import i18n from "../i18n";

export function gradeTags(blog, isDefaultLang, lang) {
  const tags = [];
  const posts = blog[lang];
  posts.forEach(post => {
    if (post.tags != null) {
      post.tags.forEach(tag => {
        if (tag === undefined) return;
        if (tags.some(t => t.value === tag)) {
          tags.find(t => t.value === tag).hits++;
        } else {
          tags.push({
            value: tag,
            hits: 1,
            path: isDefaultLang
              ? `/${i18n.t("tags", { lng: lang })}/${tag}/`
              : `/${lang}/${i18n.t("tags", { lng: lang })}/${tag}/`
          });
        }
      });
    }
  });
  return tags;
}

function mapPost(post, loadEagerly) {
  return loadEagerly ? post : { date: post.date, title: post.title };
}

export default function Index(content, defaultLang, lang, loadEagerly) {
  const { blog, home } = content;
  const isDefaultLang = defaultLang === lang;
  const path = isDefaultLang ? "/" : `/${lang}/`;
  const tags = gradeTags(blog, defaultLang === lang, lang);

  return {
    path,
    template: "src/pages/index",
    getData: () => ({
      home: home[lang][0],
      posts: blog[lang].map(p => ({
        ...mapPost(p, loadEagerly),
        path: `${path}${i18n.t("posts", { lng: lang })}/${p.url}`
      })),
      lang,
      isDefaultLang,
      langRefs: [
        ...Object.keys(blog)
          .filter(lng => lng !== defaultLang)
          .map(lng => ({
            lang: lng,
            url: `/${lng}`,
            selected: lng === lang
          })),
        { lang: defaultLang, url: "/", selected: defaultLang === lang }
      ],
      tags,
      root: path,
      date: new Date().toISOString()
    }),
    children: Posts(blog, defaultLang, lang, tags, path)
  };
}
