import Footer from "../components/Footer";
import React from "react";
import {useRouteData} from "react-static";
import convert from "htmr";
import Header from "../components/Header";
import {useTranslation} from "../i18n";

export default () => {
    let {
        page,
        lang,
        langRefs,
        root
    } = useRouteData();
    console.log(langRefs)
    const {t} = useTranslation();

    return (
        <div className="container tags-container post-container">
            <div className="page">
                <Header
                    disableSearch={true}
                    root={root}
                    seo={{
                        title:
                            page.title +
                            " - " +
                            t("site title", {lng: lang}),
                        description: page.date,
                        lang,
                        type: "website",
                        langRefs: langRefs,
                        twitterContentUsername: t("twitter author", {lng: lang}),
                        twitterCard: "summary",
                        noindex: true
                    }}
                />
                <main>
                    <h1 className="uppercase title header" role="heading" aria-level="1">{page.title}</h1>
                    {convert(page.contents)}
                    <Footer langRefs={langRefs} lang={lang}/>
                </main>
            </div>
        </div>
    );
};
