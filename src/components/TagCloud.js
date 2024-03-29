// noinspection ES6PreferShortImport
import { Link } from "../components/Router";
import React from "react";
import { useTranslation } from "../i18n";
import { Length } from "../model/Length";

export default function TagCloud({ tags, lang, limited }) {
  const { t } = useTranslation();
  const lengthTags = tags.filter(tag =>
    Object.values(Length).some(length => tag.value === t(length, { lng: lang }))
  );
  lengthTags.sort((a, b) => a.value.localeCompare(b.value));
  tags = tags.filter(
    tag => !lengthTags.some(lengthTag => lengthTag.value === tag.value)
  );
  tags.sort((a, b) => b.hits - a.hits);
  if (limited) {
    tags = tags.slice(0, 50);
  }

  return (
    <nav className="tag-cloud fadeIn" aria-label={t("Tag cloud", { lng: lang })}>
      <div className="tag-cloud-container">
        {tags.map(tag => (
          <Link className={"nofetch"} key={tag.value} to={tag.path}>{` #${tag.value}`}</Link>
        ))}
      </div>
        {lengthTags && (
            <div>
                <br />
                {lengthTags.map(tag => (
                    <div key={tag.value}>
                        <Link className={"nofetch"} to={tag.path}>{`${tag.value}`}</Link>
                    </div>
                ))}
            </div>
        )}
    </nav>
  );
}
