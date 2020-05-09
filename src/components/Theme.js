import Cookies from "universal-cookie";
import React from "react";
import { useTranslation } from "react-i18next";
import config from "../template.config";
import { loadComments, loadHighlight } from "../utils";

export default function Theme({ lang }) {
  const { t } = useTranslation();
  const switchTheme = () => {
    const themeManager = document.getElementById("theme");
    themeManager.classList.toggle("theme-light");
    themeManager.classList.toggle("theme-dark");
    const theme = [].slice
      .call(themeManager.classList)
      .filter((c) => c.indexOf("theme-") >= 0)[0];
    const cookies = new Cookies();
    cookies.set("theme", theme, { path: "/", maxAge: 365 * 24 * 60 * 60 });

    const anchor = document.getElementById("comments");
    if (anchor != null) {
      while (anchor.firstChild) {
        anchor.removeChild(anchor.firstChild);
      }
      loadComments(anchor, config.optional.commentsRepo, getCommentsTheme());
      loadHighlight(getHighlightTheme());
    }
  };

  return (
    <div className="theme-switcher">
      <img
        onClick={() => switchTheme()}
        src="/img/theme-button.svg"
        width="50"
        alt={t("Switch theme", {lng: lang})}
        title={t("Switch theme", {lng: lang})}
      />
    </div>
  );
}

export const getCommentsTheme = () => {
  const theme = new Cookies().get("theme");
  const commentsTheme =
    theme === undefined
      ? "github-light"
      : theme.indexOf("light") >= 0
      ? "github-light"
      : "photon-dark";
  return commentsTheme;
};

export const loadTheme = () => {
  const cookies = new Cookies();
  const themeManager = document.getElementById("theme");
  if (cookies.get("theme")) {
    const theme = cookies.get("theme");
    if (!themeManager.classList.contains(theme)) {
      [].slice
        .call(themeManager.classList)
        .filter(c => c.indexOf("theme-") >= 0)
        .forEach(c => themeManager.classList.remove(c));
      themeManager.classList.add(theme);
    }
  }
  themeManager.classList.add("transition-theme");
};

export const getHighlightTheme = () => {
  const theme = new Cookies().get("theme");
  const highlightTheme =
    theme === undefined
      ? "idea"
      : theme.indexOf("light") >= 0
      ? "idea"
      : "dark";
  return highlightTheme;
};
