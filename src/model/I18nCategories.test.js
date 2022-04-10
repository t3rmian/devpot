import jdown from "jdown";
import I18nCategories from "./I18nCategories";

describe("Categories model", () => {
    const miscEn = {
        path: "/category/misc",
        noindex: true,
        template: "src/containers/Category",
    };

    const miscPl = {
        path: "/pl/kategoria/inne",
        noindex: true,
        template: "src/containers/Category",
    };

    function withData(templateWrapper, data) {
        return {
            ...templateWrapper,
            _data: expect.objectContaining({...data,})
        }
    }

    async function createCategories(defaultLanguage) {
        const blog = await jdown("content/posts", {fileInfo: true});
        const categories = I18nCategories(blog, defaultLanguage);
        categories.forEach(category => category._data = category.getData());
        return categories;
    }

    test('is correct template [en]', async () => {
        const categories = await createCategories('en');
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(miscEn),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(miscPl),
        ]));
    })

    test('is correct template [pl]', async () => {
        const category = await createCategories('pl');
        expect(category).toEqual(expect.arrayContaining([
            expect.objectContaining({...miscEn, path: "/en/category/misc"}),
        ]));
        expect(category).toEqual(expect.arrayContaining([
            expect.objectContaining({...miscPl, path: "/kategoria/inne"}),
        ]));
    })

    test('contains route data [en]', async () => {
        const categories = await createCategories('en');

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscEn, {
                lang: "en",
                noindex: true,
                isDefaultLang: true,
                category: "Misc",
                root: "/",
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscPl, {
                lang: "pl",
                noindex: true,
                isDefaultLang: false,
                category: "Inne",
                root: "/pl/",
            })),
        ]));
    })

    test('contains posts route data [en]', async () => {
        const categories = await createCategories('en');

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscEn, {
                posts: expect.arrayContaining([
                    expect.objectContaining({
                        path: "/posts/plantuml"
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscPl, {
                posts: expect.arrayContaining([
                    expect.objectContaining({
                        path: "/pl/posty/plantuml"
                    }),
                ])
            })),
        ]));
    })

    test('contains langRefs route data [en]', async () => {
        const categories = await createCategories('en');

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscEn, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/category/misc/", selected: true,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/kategoria/inne/", selected: false,
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscPl, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/category/misc/", selected: false,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/kategoria/inne/", selected: true,
                    }),
                ]),
            })),
        ]));
    })

    test('contains tags route data [en]', async () => {
        const categories = await createCategories('en');

        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscEn, {
                tags: expect.arrayContaining([
                    expect.objectContaining({
                        value: "uml", path: "/tags/uml/"
                    }),
                ])
            })),
        ]));
        expect(categories).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(miscPl, {
                tags: expect.arrayContaining([
                    expect.objectContaining({
                        value: "uml", path: "/pl/tagi/uml/"
                    }),
                ])
            })),
        ]));
    })
});