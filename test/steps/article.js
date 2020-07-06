const { Given, When, Then } = require('cucumber');

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