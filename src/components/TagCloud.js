import { Link } from "components/Router";
import React from "react";
import { useTranslation } from "react-i18next";

export default function TagCloud({ tags, lang }) {
  const { t } = useTranslation();
  tags.sort((a, b) => b.hits - a.hits);

  return (
    <nav className="tag-cloud fadeIn">
      {t("Tag cloud", { lng: lang })}
      <div>
        {tags.map(tag => (
          <Link key={tag.value} to={tag.path}>{` ${tag.value}`}</Link>
        ))}
      </div>
    </nav>
  );
}
