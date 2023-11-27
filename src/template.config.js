import {globalHistory} from "@reach/router";

const config = {
  author: "Damian Terlecki",
  authorSite: "https://termian.dev",
  authorPicture: "data:image/jpeg;base64,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",
  authorPictureSeo: "https://avatars.githubusercontent.com/u/20327242",
  siteLongTitle: "☕ Devpot",
  siteShortTitle: "Devpot",
  siteTitle: "Devpot",
  siteRoot: isPreview() ? process.env.DEPLOY_PRIME_URL : "https://blog.termian.dev",
  defaultLanguage: "en",

  optional: {
    commentsRepo: "t3rmian/devpot",
    ga: isPreview() ? null : "UA-73928706-7",
    twitterAuthor: "t3rmian",
    braveRewardsToken:
        "d8168da8e5089e3919156575ad5514238efa9fcd453950683ab55ebbf2be54e5",
  }
};
export default config;

export function isPreview() {
  return process.env.CONTEXT && process.env.CONTEXT !== 'production';
}

export function getGACode() {
  Object.defineProperty(document, "cookie", {
    get: function() {
      return "";
    },
    set: function() {}
  });
  window.dataLayer = window.dataLayer || [];
  (window.adsbygoogle = window.adsbygoogle || []).push({});

  function gtag() {
    window.dataLayer.push(arguments);
  }

  let gtagConfig = {
    'page_path': window.location.pathname,
    'allow_ad_personalization_signals': false,
    'allow_google_signals': false,
    'anonymize_ip': true,
    'send_page_view': true,
    'ad_storage': 'denied',
    'analytics_storage': 'denied',
    'functionality_storage': 'denied',
    'personalization_storage': 'denied',
    'security_storage': 'denied',
    'storage': 'none',
    'client_storage': 'none',
  };
  gtag("js", new Date());
  gtag("config", config.optional.ga, gtagConfig);
  const observer = new MutationObserver(function() {
    if (gtagConfig.page_path === location.pathname) {
      return
    }
    gtagConfig.page_path = location.pathname
    gtag('config', config.optional.ga, gtagConfig);
  });
  observer.observe(document, {subtree: true, childList: true});
}