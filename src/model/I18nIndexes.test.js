import jdown from "jdown";
import I18nIndexes from "./I18nIndexes";

describe("Indexes model", () => {
    const indexEn = {
        path: "/",
        template: "src/pages/index",
        children: expect.arrayContaining([
            expect.objectContaining({
                "path": "posts/plantuml/",
                "template": "src/containers/Post",
            }),
        ])
    };

    const indexPl = {
        path: "/pl/",
        template: "src/pages/index",
        children: expect.arrayContaining([
            expect.objectContaining({
                "path": "posty/plantuml/",
                "template": "src/containers/Post",
            }),
        ])
    };

    function withData(category, data) {
        return {
            ...category,
            _data: expect.objectContaining({...data,})
        }
    }

    async function createIndexes(defaultLanguage) {
        const blog = await jdown("content/posts", {fileInfo: true});
        const home = await jdown("content/home", {fileInfo: true});
        const indexes = I18nIndexes(blog, defaultLanguage, home);
        indexes.forEach(category => category._data = category.getData());
        return indexes;
    }

    test('is correct template [en]', async () => {
        const indexes = await createIndexes('en');
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(indexEn),
        ]));
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(indexPl),
        ]));
        expect(indexes).toEqual(expect.not.arrayContaining([
            expect.objectContaining({noindex: expect.anything()}),
        ]));
    })

    test('is correct template [pl]', async () => {
        const indexes = await createIndexes('pl');
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining({...indexEn, path: "/en/"}),
        ]));
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining({...indexPl, path: "/"}),
        ]));
        expect(indexes).toEqual(expect.not.arrayContaining([
            expect.objectContaining({noindex: expect.anything()}),
        ]));
    })

    test('contains route data [en]', async () => {
        const indexes = await createIndexes('en');

        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(indexEn, {
                lang: "en",
                isDefaultLang: true,
                date: expect.any(String),
                root: "/",
            })),
        ]));
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(indexPl, {
                lang: "pl",
                isDefaultLang: false,
                date: expect.any(String),
                root: "/pl/",
            })),
        ]));
        expect(indexes).toEqual(expect.not.arrayContaining([
            expect.objectContaining(withData(indexEn, {
                noindex: expect.anything(),
            })),
        ]));
    })

    test('contains langRefs route data [en]', async () => {
        const indexes = await createIndexes('en');

        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(indexEn, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/", selected: true,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/", selected: false,
                    }),
                ])
            })),
        ]));
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(indexPl, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/", selected: false,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/", selected: true,
                    }),
                ]),
            })),
        ]));
    })

    test('contains tags route data [en]', async () => {
        const indexes = await createIndexes('en');

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
        const indexes = await createIndexes('en');

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
        const indexes = await createIndexes('en');

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
        const indexes = await createIndexes('en');

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