const { Given, When, Then } = require('cucumber');

When('I open first article', () => {
  const link = $$('main a')[0];
  this.secondArticleTitle = $$('main a')[1].getText();
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