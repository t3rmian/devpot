import i18n from "../i18n";
import {flatMap} from "../utils";

export const Category = {
    getKey: (category) => {
        return category == null ? null : Object.keys(category)[0];
    },
    getValue: (category) => {
        return category[Category.getKey(category)];
    },
    getNormalizedValue: (category) => {
        return Category.getValue(category).toLowerCase();
    },
    equals: (category1, category2) => {
        return Category.getKey(category1) === Category.getKey(category2)
    },
    containsCategory: (item, flatCategory) => {
        return item.category == null ? false
            : [...item.category].some(c => Category.equals(c, flatCategory));
    },
}

export const Blog = {
    flatMapByLanguage: (blog, defaultLanguage, defaultLanguageMapper, nonDefaultLanguageMapper) => {
        return Object.keys(blog)
            .flatMap(lang => lang === defaultLanguage ? blog[lang].map(defaultLanguageMapper) : blog[lang].map(nonDefaultLanguageMapper))
            .filter(x => x)
    },
    mapByLanguage: (blog, defaultLanguage, defaultLanguageMapper, nonDefaultLanguageMapper = defaultLanguageMapper) => {
        return Object.keys(blog)
            .flatMap(lang => lang === defaultLanguage ? defaultLanguageMapper(lang) : nonDefaultLanguageMapper(lang))
            .filter(x => x)
    },
    getTranslatedCategories: (posts, categoryLevel) => {
        return [posts.flatMap(post => post.category).find(translatedCategoryLevel => Category.equals(translatedCategoryLevel, categoryLevel))]
            .filter(x => x)
    }
}

export const RefLang = {
    explode: (ref, i18nPage, langFilter, refToUrlMapper) => Blog.mapByLanguage(i18nPage.blog, i18nPage.defaultLang, (blogLang) =>
        langFilter(ref, blogLang)
            .map(object => refToUrlMapper(object, blogLang))
            .map(url => RefLang.create(blogLang, blogLang === i18nPage.lang, Path.i18n(blogLang, i18nPage.defaultLang, url)))
    ),
    create: (lang, selected, url) => (
        {
            lang,
            url,
            selected
        }
    )
}

export function uniq(array) {
    return [...new Set(array.map(i => JSON.stringify(i)))].map(i => JSON.parse(i));
}

export const Path = {
    i18n: (lang, defaultLang, path) => lang === defaultLang ? path : `/${lang}${path}`,
}

export class I18nPage {
    constructor(blog, defaultLang, lang) {
        this.blog = blog;
        this.defaultLang = defaultLang;
        this.lang = lang;
    }

    isDefaultLang() {
        return this.lang === this.defaultLang;
    }

    getRoot() {
        return this.isDefaultLang() ? "/" : `/${this.lang}/`;
    }

    getPath(pathPart) {
        return `${this.getRoot()}${i18n.t(pathPart, {lng: this.lang})}/`
    }

    getPosts(lang = this.lang) {
        return this.blog[lang];
    }

    mapPost(post, loadEagerly) {
        return loadEagerly ? post : {
            date: post.date,
            title: post.title,
            devMode: post.devMode,
            imageUrl: post.imageUrl,
            minutesRead: post.minutesRead
        };
    }

    getExplodedPosts(filter, loadEagerly) {
        return this.getPosts()
            .filter(filter)
            .map(p => ({
                ...this.mapPost(p, loadEagerly),
                path: `${this.getPath("posts")}${p.url}`
            }));
    }

    getGradedTags() {
        const tags = [];
        const posts = this.getPosts();
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
                            path: `${this.getPath("tags")}${tag}/`
                        });
                    }
                });
            }
        });
        return tags;
    }

    getFlatPostProperties(property) {
        return uniq([...new Set(flatMap(this.getPosts(), post => post[property]))].filter(a => a));
    }

    getCommonData(postFilter, loadEagerly) {
        return {
            posts: postFilter ? this.getExplodedPosts(postFilter) : this.getExplodedPosts(() => true, loadEagerly),
            lang: this.lang,
            isDefaultLang: this.isDefaultLang(),
            root: this.getRoot(),
            tags: this.getGradedTags(),
        }
    }

}