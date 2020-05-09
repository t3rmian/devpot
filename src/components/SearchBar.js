import React from "react";
import { navigate } from "components/Router";
import { useTranslation } from "react-i18next";

export default ({root, lang}) => {
  const { t } = useTranslation();
  const onSubmit = e => {
    e.preventDefault();
    const form = e.target;
    const query =
      "?" +
      Array.from(new FormData(form), p =>
        p.map(encodeURIComponent).join("=")
      ).join("&");
    if (query !== "?q=") {
      navigate(form.action + query);
    }
  };

  return (
    <div className={`search-bar-container fadeIn`} role="search">
      <form
        onSubmit={e => onSubmit(e)}
        action={root + t("search", { lng: lang })}
        className="search-bar"
      >
        <input aria-label={t("search", { lng: lang })} type="search" name="q" placeholder={t("search", { lng: lang }) + "…"}/>
        {/* 'q' name is shorthand for query since it's not translated */}
        <button>⌕</button>
      </form>
    </div>
  );
};
