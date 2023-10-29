function getTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return "theme-light";
  }
  return undefined;
}


export const getCommentsTheme = () => {
  const theme = getTheme();
  return theme === undefined
      ? "github-dark"
      : theme.indexOf("light") >= 0
          ? "github-light"
          : "photon-dark";
};

export const loadSiteTheme = () => {
  const themeManager = document.getElementById("theme");
  const theme = getTheme();
  if (theme) {
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
  const theme = getTheme();
  return theme === undefined
      ? "dark"
      : theme.indexOf("light") >= 0
          ? "idea"
          : "dark";
};
