import Cookies from "universal-cookie";
import React from "react";
import { useTranslation } from "react-i18next";
import { loadHighlight, makeVisible } from "../utils";

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

    const commentsFrame = document.querySelector("#comments iframe");
    if (commentsFrame != null) {
      makeVisible(commentsFrame.parentElement, false)
      setTimeout(e => {
        commentsFrame.contentWindow.postMessage({ type: "set-theme", theme: getCommentsTheme() },  "*")
      }, 250)
      setTimeout(e => {
        makeVisible(commentsFrame.parentElement, true)
      }, 600)
      loadHighlight(getHighlightTheme());
    }
  };

  return (
    <div className="theme-switcher">
      <svg
        onClick={() => switchTheme()}
        width="50"
        alt={t("Switch theme", { lng: lang })}
        title={t("Switch theme", { lng: lang })}
        viewBox="0 0 286.91379 286.91379"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          transform="matrix(.83895 0 0 1.0414 -119.55 -375.73)"
          d="m484.49 498.52c0 76.076-76.558 137.75-171 137.75s-171-61.672-171-137.75 76.558-137.75 171-137.75 171 61.672 171 137.75z"
          fill="#808080"
        />
        <g
          transform="matrix(.85307 0 0 .85307 -836.31 -761.05)"
          fill="none"
          stroke="#fff"
          strokeWidth="11.722"
        >
          <path d="m1136.2 1139.8 22.938-7.6584" strokeLinecap="round" />
          <path d="m1136 1157.6 34.18-12.869" strokeLinecap="round" />
          <path d="m1146.9 1170.1 22.938-7.6584" strokeLinecap="round" />
          <path d="m1176.7 1133.1s0-4.6511 2.4762-22.102c2.4404-17.136 27.148-57.757 28.168-59.187 8.6124-10.518 13.743-23.397 13.743-37.361 0-35.331-32.5-63.977-72.584-63.977-40.088 0-72.586 28.646-72.586 63.977 0 13.964 5.1301 26.844 13.74 37.361 1.0187 1.4315 25.732 42.052 28.17 59.187 2.4788 17.451 2.4788 22.102 2.4788 22.102" />
        </g>
      </svg>
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
