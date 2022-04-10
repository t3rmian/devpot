import jdown from "jdown";
import Posts from "./Posts";
import {I18nPage} from "./utils";

describe("Posts model", () => {
    const umlEn = {
        path: "posts/plantuml/",
        template: "src/containers/Post",
    };

    const umlPl = {
        path: "posty/plantuml/",
        template: "src/containers/Post",
    };

    function withData(templateWrapper, data) {
        return {
            ...templateWrapper,
            _data: expect.objectContaining({...data,})
        }
    }

    async function createPosts(language) {
        const blog = await jdown("content/posts", {fileInfo: true});
        const posts = Posts(new I18nPage(blog, 'en', language));
        posts.forEach(category => category._data = category.getData());
        return posts;
    }

    test('is correct template [en]', async () => {
        const posts = await createPosts('en');
        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(umlEn),
        ]));
        expect(posts).toEqual(expect.not.arrayContaining([
            expect.objectContaining(umlPl),
        ]));
    })
    test('is correct template [pl]', async () => {
        const posts = await createPosts('pl');
        expect(posts).toEqual(expect.not.arrayContaining([
            expect.objectContaining(umlEn),
        ]));
        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(umlPl),
        ]));
    })

    test('contains route data [en]', async () => {
        const posts = await createPosts('en');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                lang: "en",
                isDefaultLang: true,
                root: "/",
            })),
        ]));
    })
    test('contains route data [pl]', async () => {
        const posts = await createPosts('pl');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                lang: "pl",
                isDefaultLang: false,
                root: "/pl/",
            })),
        ]));
    })

    test('contains categories route data [en]', async () => {
        const posts = await createPosts('en');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                categories: expect.arrayContaining([
                    expect.objectContaining({
                        key: "other",
                        path: "/category/misc/",
                    }),
                ]),
                post: expect.objectContaining({
                    category: expect.arrayContaining([
                        expect.objectContaining({
                            other: "Misc"
                        }),
                    ])
                }),
            })),
        ]));
    })
    test('contains categories route data [pl]', async () => {
        const posts = await createPosts('pl');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                categories: expect.arrayContaining([
                    expect.objectContaining({
                        key: "other",
                        path: "/pl/kategoria/inne/"
                    }),
                ]),
                post: expect.objectContaining({
                    category: expect.arrayContaining([
                        expect.objectContaining({
                            other: "Inne"
                        }),
                    ])
                }),
            })),
        ]));
    })

    test('contains langRefs route data [en]', async () => {
        const posts = await createPosts('en');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/posts/plantuml/", selected: true,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/posty/plantuml/", selected: false,
                    }),
                ])
            })),
        ]));
    })
    test('contains langRefs route data [pl]', async () => {
        const posts = await createPosts('pl');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                langRefs: expect.arrayContaining([
                    expect.objectContaining({
                        lang: "en", url: "/posts/plantuml/", selected: false,
                    }),
                    expect.objectContaining({
                        lang: "pl", url: "/pl/posty/plantuml/", selected: true,
                    }),
                ])
            })),
        ]));
    })

    test('contains tags route data [en]', async () => {
        const posts = await createPosts('en');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                tags: expect.arrayContaining([
                    expect.objectContaining({
                        value: "uml", path: "/tags/uml/"
                    }),
                ])
            })),
        ]));
    })

    test('contains post route data [en]', async () => {
        const posts = await createPosts('en');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlEn, {
                post: expect.objectContaining({
                    author: expect.any(String),
                    contents: expect.any(String),
                    date: expect.any(Date),
                    id: expect.any(Number),
                    next: expect.objectContaining({
                        title: expect.any(String),
                        url: "/posts/git-monthly-work-log/",
                    }),
                    tags: expect.arrayContaining([
                        "uml"
                    ]),
                    title: expect.any(String),
                    url: "plantuml",
                }),
            })),
        ]));
    })
    test('contains post route data [pl]', async () => {
        const posts = await createPosts('pl');

        expect(posts).toEqual(expect.arrayContaining([
            expect.objectContaining(withData(umlPl, {
                post: expect.objectContaining({
                    author: expect.any(String),
                    contents: expect.any(String),
                    date: expect.any(Date),
                    id: expect.any(Number),
                    next: expect.objectContaining({
                        title: expect.any(String),
                        url: "/pl/posty/git-ept/",
                    }),
                    tags: expect.arrayContaining([
                        "uml"
                    ]),
                    title: expect.any(String),
                    url: "plantuml",
                }),
            })),
        ]));
    })
});