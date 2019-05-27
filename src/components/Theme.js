import Cookies from "universal-cookie";
import React from "react";
import { useTranslation } from "react-i18next";
import config from "../template.config";
import { loadComments, loadHighlight } from "../utils";

export default function Theme() {
  const { t } = useTranslation();
  const switchTheme = () => {
    const themeManager = document.getElementById("theme");
    themeManager.classList.toggle("theme-light");
    themeManager.classList.toggle("theme-dark");
    const theme = [].slice
      .call(themeManager.classList)
      .filter(c => c.indexOf("theme-") >= 0)[0];
    const cookies = new Cookies();
    cookies.set("theme", theme);

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
      <button onClick={() => switchTheme()}>
        <span
          role="img"
          aria-label={t("Light theme")}
          style={{ filter: "invert(1) contrast(10)" }}
        >
          ⚫
        </span>
        <span style={{ color: "white" }}>🢀</span>
        <span style={{ color: "black" }}>🢂</span>
        <span
          role="img"
          aria-label={t("Dark theme")}
          style={{ filter: "contrast(10)" }}
        >
          ⚫
        </span>
      </button>
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
  if (cookies.get("theme")) {
    const theme = cookies.get("theme");
    const themeManager = document.getElementById("theme");
    if (!themeManager.classList.contains(theme)) {
      [].slice
        .call(themeManager.classList)
        .filter(c => c.indexOf("theme-") >= 0)
        .forEach(c => themeManager.classList.remove(c));
      themeManager.classList.add(theme);
    }
  }
};

export const getHighlightTheme = () => {
  const theme = new Cookies().get("theme");
  const highlightTheme =
    theme === undefined
      ? "github"
      : theme.indexOf("light") >= 0
      ? "github"
      : "monokai-sublime";
  return highlightTheme;
};
