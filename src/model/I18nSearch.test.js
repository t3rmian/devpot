import jdown from "jdown";
import I18nSearch from "./I18nSearch";
import {getPages} from "../../static.config";

describe("Search model", () => {
  const indexEn = {
    path: "/search",
    template: "src/containers/Search",
    noindex: true,
  };

  const indexPl = {
    path: "/pl/szukaj",
    template: "src/containers/Search",
    noindex: true,
  };

  function withData(templateWrapper, data) {
    return {
      ...templateWrapper,
      _data: expect.objectContaining({...data,})
    }
  }

  async function createSearch(defaultLanguage) {
    const blog = await jdown("content/posts", {fileInfo: true});
    const home = await getPages("content/pages");
    const indexes = I18nSearch(blog, defaultLanguage, home);
    indexes.forEach(category => category._data = category.getData());
    return indexes;
  }

  test('is correct template [en]', async () => {
    const indexes = await createSearch('en');
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(indexEn),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(indexPl),
    ]));
    expect(indexes).toEqual(expect.not.arrayContaining([
      expect.objectContaining({children: expect.anything()}),
    ]));
  })

  test('is correct template [pl]', async () => {
    const indexes = await createSearch('pl');
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({...indexEn, path: "/en/search"}),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({...indexPl, path: "/szukaj"}),
    ]));
    expect(indexes).toEqual(expect.not.arrayContaining([
      expect.objectContaining({children: expect.anything()}),
    ]));
  })

  test('contains route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        path: indexEn.path,
        lang: "en",
        isDefaultLang: true,
        date: expect.any(String),
        root: "/",
        noindex: true,
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        path: indexPl.path,
        lang: "pl",
        isDefaultLang: false,
        date: expect.any(String),
        root: "/pl/",
        noindex: true,
      })),
    ]));
  })

  test('contains langRefs route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        langRefs: expect.arrayContaining([
          expect.objectContaining({
            lang: "en", url: "/search", selected: true,
          }),
          expect.objectContaining({
            lang: "pl", url: "/pl/szukaj", selected: false,
          }),
        ])
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        langRefs: expect.arrayContaining([
          expect.objectContaining({
            lang: "en", url: "/search", selected: false,
          }),
          expect.objectContaining({
            lang: "pl", url: "/pl/szukaj", selected: true,
          }),
        ]),
      })),
    ]));
  })

  test('contains tags route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        tags: expect.arrayContaining([
          expect.objectContaining({
            value: "uml", path: "/tags/uml/"
          }),
        ])
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        tags: expect.arrayContaining([
          expect.objectContaining({
            value: "uml", path: "/pl/tagi/uml/"
          }),
        ])
      })),
    ]));
  })

  test('contains categories route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        categories: expect.arrayContaining([
          expect.objectContaining({
            key: "other", value: "Misc", path: "/category/misc/"
          }),
        ])
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        categories: expect.arrayContaining([
          expect.objectContaining({
            key: "other", value: "Inne", path: "/pl/kategoria/inne/"
          }),
        ])
      })),
    ]));
  })

  test('contains home route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        home: expect.objectContaining({
          contents: expect.any(String), title: expect.any(String), fileInfo: expect.objectContaining({
            path: expect.stringContaining("en")
          })
        }),
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        home: expect.objectContaining({
          contents: expect.any(String), title: expect.any(String), fileInfo: expect.objectContaining({
            path: expect.stringContaining("pl")
          })
        }),
      })),
    ]));
  })

  test('contains posts route data [en]', async () => {
    const indexes = await createSearch('en');

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexEn, {
        posts: expect.objectContaining([expect.objectContaining({
          date: expect.any(Date),
          path: "/posts/plantuml",
          title: "PlantUML as go-to UML CASE tool"
        })]),
      })),
    ]));
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining(withData(indexPl, {
        posts: expect.arrayContaining([expect.objectContaining({
          date: expect.any(Date),
          path: "/pl/posty/plantuml",
          title: "PlantUML — czarny koń wśród narzędzi UML CASE"
        })]),
      })),
    ]));
  })
});