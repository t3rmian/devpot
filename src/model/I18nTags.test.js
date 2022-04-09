import jdown from "jdown";
import I18nTags from "./I18nTags";

describe("Tags model", () => {
    const umlEn = {
        path: "/tags/uml",
        noindex: true,
        template: "src/containers/Tags",
    };
    const umlPl = {
        path: "/pl/tagi/uml",
        noindex: true,
        template: "src/containers/Tags",
    };

    function withData(category, data) {
        return {
            ...category,
            _data: expect.objectContaining({...data,})
        }
    }

    test('is correct template [en]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nTags(blog, 'en');
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(umlEn),
            expect.objectContaining(umlPl),
        ]));
    })

    test('is correct template [pl]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const category = I18nTags(blog, 'pl');
        expect(category).toEqual(expect.arrayContaining([
            expect.objectContaining({...umlEn, path: "/en/tags/uml"}),
            expect.objectContaining({...umlPl, path: "/tagi/uml"}),
        ]));
    })

    test('contains route data [en]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nTags(blog, 'en');

        categories.forEach(category => category._data = category.getData());

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                lang: "en",
                noindex: true,
                isDefaultLang: true,
                tag: "uml",
                root: "/",
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                lang: "pl",
                noindex: true,
                isDefaultLang: false,
                tag: "uml",
                root: "/pl/",
            })),
        ]));
    })

    test('contains posts route data [en]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nTags(blog, 'en');

        categories.forEach(category => category._data = category.getData());

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                posts: expect.arrayContaining([
                    expect.objectContaining({
                        path: "/posts/plantuml"
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                posts: expect.arrayContaining([
                    expect.objectContaining({
                        path: "/pl/posty/plantuml"
                    }),
                ])
            })),
        ]));
    })

    test('contains langRefs route data [en]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nTags(blog, 'en');

        categories.forEach(category => category._data = category.getData());

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/tags/uml/", selected: true,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/tagi/uml/", selected: false,
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/tags/uml/", selected: false,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/tagi/uml/", selected: true,
                    }),
                ]),
            })),
        ]));
    })

    test('contains tags route data [en]', async () => {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nTags(blog, 'en');

        categories.forEach(category => category._data = category.getData());

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                tags: expect.arrayContaining([
                    expect.objectContaining({
                        value: "uml", path: "/tags/uml/"
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                tags: expect.arrayContaining([
                    expect.objectContaining({
                        value: "uml", path: "/pl/tagi/uml/"
                    }),
                ])
            })),
        ]));
    })
});