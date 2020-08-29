import { Head } from "react-static";
import React from "react";
import { useSiteData } from "react-static";
import { useTranslation } from "react-i18next";

export function absoluteUrl(siteRoot, url) {
  const isAbsolute = new RegExp("^(?:[a-z]+:)?//", "i");
  return isAbsolute.test(url) ? url : siteRoot + url;
}

export function elipsizeDescription(description) {
  const extractedDescription = description.replace(/<(.|\n)*?>/g, "");
  description =
    extractedDescription.length > 160
      ? extractedDescription.substring(0, 159) + "…"
      : extractedDescription;
  return description;
}


export default ({
  title,
  lang,
  description,
  type,
  image,
  date,
  langRefs,
  twitterContentUsername,
  twitterCard,
  noindex
}) => {
  description = elipsizeDescription(description);
  const { siteRoot } = useSiteData();
  const { t } = useTranslation();
  const manifest = lang === t("defaultLang") ? "/site.webmanifest" : `/site-${lang}.webmanifest`;
  const siteName = t("site title", { lng: lang });
  const twitterSiteUsername = t("twitter author", { lng: lang });

  return (
    <Head>
      <html lang={lang} />
      <link rel="manifest" href={manifest} />
      <title>{title}</title>
      {noindex && <meta name="robots" content="noindex" />}
      <meta name="description" property="description" content={description} />
      {type && <meta property="og:type" content={type} />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image && (
        <meta property="og:image" content={absoluteUrl(siteRoot, image)} />
      )}
      <meta
        property="og:url"
        content={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}
      />
      <meta property="og:site_name" content={siteName} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && (
        <meta name="twitter:image" content={absoluteUrl(siteRoot, image)} />
      )}
      {twitterSiteUsername && (
        <meta name="twitter:site" content={`@${twitterSiteUsername}`} />
      )}
      {twitterContentUsername && (
        <meta name="twitter:creator" content={`@${twitterContentUsername}`} />
      )}
      {twitterCard && <meta name="twitter:card" content={twitterCard} />}
      {date && <meta name="date" content={date} />}
    </Head>
  );
};
