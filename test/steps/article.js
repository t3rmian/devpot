const { Given, When, Then } = require('cucumber');
const fs = require("fs-extra");

When('I open first article', () => {
  const links = $$('main a');
  const link = links[0];
  this.secondArticleTitle = links[1].getText();
  link.getText();
  link.click();
});

When('I open last article', () => {
  const links = $$('main a');
  const link = links[links.length - 1];
  this.secondArticleTitle = links[links.length - 2].getText();
  link.getText();
  link.click();
});

Then('I should see a link to a previous article', () => {
  const link = $$('.post-footer a')[0];
  expect(link.getText().toUpperCase()).to.include(this.secondArticleTitle.toUpperCase());
});

When('I click a link to a previous article', () => {
  const link = $$('.post-footer a')[0];
  link.click();
});

Then('I should see the previous article', () => {
  expect($$('.title')[0].getText().toUpperCase()).to.include(this.secondArticleTitle.toUpperCase());
});

Then('I should see a link to a next article', () => {
  const footerLinks = $$('.post-footer a');
  const link = footerLinks[footerLinks.length - 1];
  expect(link.getText().toUpperCase()).to.include(this.secondArticleTitle.toUpperCase());
});

When('I click a link to a next article', () => {
  const footerLinks = $$('.post-footer a');
  const link = footerLinks[footerLinks.length - 1];
  link.click();
});

Then('I should see the next article', () => {
  expect($$('.title')[0].getText().toUpperCase()).to.include(this.secondArticleTitle.toUpperCase());
});

When('I open page with source link', () => {
  const root = "./content/posts/collections/en/";
  const dir = fs.opendirSync(root);
  let entry;
  while ((entry = dir.readSync()) !== null) {
    const rawFile = fs.readFileSync(root + entry.name).toString()
    const meta = rawFile.split("---")[1];
    let source;
    let url;
    if (meta.indexOf("source:") >= 0) {
      source = meta.split("source:")[1].trim().split(/\s+/)[0];
    }
    if (meta.indexOf("url:") >= 0) {
      url = meta.split("url:")[1].trim().split(/\s+/)[0];
    }
    if (source !== undefined && url !== undefined) {
      this.source = source;
      this.url = url;
      break;
    }
  }
  console.log("Entry source: " + entry.name + " " + this.url + " -> " + this.source);
  browser.url(SITE_URL + "/posts/" + this.url);
});

Then('I should see source link', () => {
  const links = $$('.post-footer a');
  let matchingLinks = 0;
  console.log("Found " + links.length + " links in the footer");
  for (let i = 0; i < links.length; i++) {
    if (links[i].getAttribute("href") === this.source) {
      console.log(links[i].getText() + " matches " + this.source);
      matchingLinks++;
    } else {
      console.log(links[i].getText() + " does not match " + this.source + " " + links[i].href);
    }
  }
  expect(matchingLinks).to.be.equal(1);
});