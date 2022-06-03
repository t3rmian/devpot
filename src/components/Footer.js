import { Head } from "react-static";
import { Link } from "components/Router";
import React from "react";
import Theme from "./Theme";
import { useTranslation } from "react-i18next";

export default function Footer({ langRefs, lang, is404 }) {
  const { t } = useTranslation();
  langRefs.sort((a, b) => t(a.lang).localeCompare(t(b.lang)));

  return (
    <footer className="langs">
      {langRefs.map(ref => (
        <span key={ref.lang} className="lang">
          <Link
            key={ref.lang}
            to={ref.url}
            data-disabled={ref.selected === true}
            hrefLang={ref.lang}
          >
            {is404 ? t(ref.lang + '404') : t(ref.lang)}
          </Link>
        </span>
      ))}
      <span className="lang">
        <a href="https://github.com/t3rmian/react-static-teapot">©</a>
      </span>
      <Head
        link={[
          ...langRefs.map(ref => ({
            rel: "alternate",
            hreflang: ref.lang,
            href: ref.url
          })),
          ...langRefs
            .filter(ref => ref.lang === t("defaultLang"))
            .map(ref => ({
              rel: "alternate",
              hreflang: "x-default",
              href: ref.url
            }))
        ]}
      />
      <Theme lang={lang} />
    </footer>
  );
}
