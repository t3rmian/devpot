import { Link } from "components/Router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Length } from "../model/Length";

export default function TagCloud({ tags, lang }) {
  const { t } = useTranslation();
  const lengthTags = tags.filter(tag =>
    Object.values(Length).some(length => tag.value === t(length, { lng: lang }))
  );
  tags = tags.filter(
    tag => !lengthTags.some(lengthTag => lengthTag.value === tag.value)
  );
  tags.sort((a, b) => b.hits - a.hits);

  return (
    <nav className="tag-cloud fadeIn">
      <div>
        <a href="https://brave.com/net946">
          {t("Tested in Brave", { lng: lang })}
        </a>
      </div>
      <br />
      {t("Tag cloud", { lng: lang })}
      <div className="tag-cloud-container">
        {tags.map(tag => (
          <Link key={tag.value} to={tag.path}>{` #${tag.value}`}</Link>
        ))}
      </div>
      <br />
      <div>
        {lengthTags.map(tag => (
          <div>
            <Link key={tag.value} to={tag.path}>{`${tag.value}`}</Link>
          </div>
        ))}
      </div>
    </nav>
  );
}
