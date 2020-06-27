if ("serviceWorker" in navigator) {
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker
      .register("/pwabuilder-sw.js", {
        scope: "/"
      });
  }
}
