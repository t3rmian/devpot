const { Given, When, Then } = require('cucumber');
const fs = require("fs-extra");
const { expect } = require('chai');

Given('I open sitemap', () => {
  this.root = SITE_URL;
  browser.url(this.root + "/sitemap.xml");
});

Then('I should see links to all articles', () => {
  const enArticles = extractArticleUrls("./content/posts/collections/en/").map(it => this.root + "/posts/" + it);
  console.log("Found " + enArticles.length + " en articles");
  expect(enArticles.length).to.be.not.equal(0);
  const plArticles = extractArticleUrls("./content/posts/collections/pl/").map(it => this.root + "/pl/posty/" + it);
  console.log("Found " + plArticles.length + " pl articles");
  expect(plArticles.length).to.be.not.equal(0);
  const allArticles = enArticles.concat(plArticles);
  allArticles.push(this.root + "/");
  allArticles.push(this.root + "/pl/");
  const sitemapLocs = $$('urlset url loc').map(loc => { return loc.getText() });
  console.log("All articles: " + allArticles.length)
  console.log(allArticles)
  console.log("Sitemap: " + sitemapLocs.length)
  console.log(sitemapLocs)
  expect(sitemapLocs.length).to.be.gte(allArticles.length);
  this.sitemapLocsText = sitemapLocs.join(",");
  for (let i = 0; i < allArticles.length; i++) {
    expect(this.sitemapLocsText).to.include(allArticles[i]);
  }
});

Then('I should not see links to tags', () => {
  expect(this.sitemapLocsText).to.not.include("tags/");
  expect(this.sitemapLocsText).to.not.include("tagi/");
  expect(this.sitemapLocsText).to.not.include("tag/");
});

Then('I should not see links to search', () => {
  expect(this.sitemapLocsText).to.not.include("search/");
  expect(this.sitemapLocsText).to.not.include("szukaj/");
});

function extractArticleUrls(root) {
  const dir = fs.opendirSync(root);
  const urls = [];
  let entry;
  while ((entry = dir.readSync()) !== null) {
    const rawFile = fs.readFileSync(root + entry.name).toString();
    if (rawFile.indexOf("url:") >= 0) {
      urls.push(rawFile.split("url:")[1].trim().split(/\s+/)[0]);
    }
  }
  return urls;
}