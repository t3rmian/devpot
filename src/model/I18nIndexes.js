import Posts from "./Posts";
import {SiteLanguageVariant, RefLang} from "./utils";

export default function I18nIndexes(blog, defaultLang, home) {
    return Object.keys(blog).map(lang =>
        Index(new SiteLanguageVariant(blog, defaultLang, lang), home, false)
    );
}

export function Index(siteVariant, pages, loadEagerly) {
  return {
    path: siteVariant.getRoot(),
    template: "src/pages/index",
    getData: () => ({
      ...siteVariant.getExplodedCommonData(undefined, loadEagerly),
      home: pages[siteVariant.lang]['home'],
      privacyPolicy: pages[siteVariant.lang]['privacy-policy'],
      langRefs: RefLang.explode(null, siteVariant, (_, lang) => [lang], () => "/"),
      categories: siteVariant.getCategories(),
      date: new Date().toISOString()
    }),
    children: Pages(siteVariant, pages, Object.values(pages[siteVariant.lang]))
        .concat(Posts(siteVariant))
  };
}

function Pages(siteVariant, pages, pagesVariant) {
  return pagesVariant
      .filter(page => page.url)
      .map(page => {
        return ({
          path: `${page.url}/`,
          template: "src/containers/Page",
          getData: () => ({
            ...siteVariant.getPageData(),
            page: page,
            langRefs: RefLang.explode(page, {
              blog: pages,
              lang: siteVariant.lang,
              defaultLang: siteVariant.defaultLang
            }, filterMatchingPage, createPath),
          })
        });
      });

  function filterMatchingPage(page, lang) {
    return [Object.values(pages[lang]).find(p => p.fileInfo.name === page.fileInfo.name)].filter(a => a);
  }

  function createPath(page, lng = siteVariant.lang) {
    return `/${pages[lng][page.fileInfo.name].url}`;
  }
}