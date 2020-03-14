export default {
  author: "Damian Terlecki",
  authorSite: isPreview() ? process.env.DEPLOY_PRIME_URL : "https://termian.dev",
  siteTitle: "Devpot",
  siteLongTitle: "Devpot: a coder's blog",
  siteRoot: "https://blog.termian.dev",
  defaultLanguage: "en",

  optional: {
    commentsRepo: "t3rmian/devpot",
    ga: isPreview() ? null : "UA-73928706-7",
    twitterAuthor: "t3rmian",
    braveRewardsToken:
      "d8168da8e5089e3919156575ad5514238efa9fcd453950683ab55ebbf2be54e5",
  }
};

function isPreview() {
  return (process && process.env && process.env.DEPLOY_PRIME_URL);
}