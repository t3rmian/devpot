const { Given, When, Then } = require('cucumber');

Given('I open non-existing page', () => {
  browser.url(SITE_URL + "/213ke09sdh89");
});
When('The loading is finished', () => {
  waitForUnload();
})
Then('I should see a 404 page', () => {
  expect($('.error').getText()).to.include("404");
});
Then('I should see the language switch', () => {
  expect($('a[hreflang=pl]').getText().toUppercase()).to.include("Polski".toUppercase());
  expect($('a[hreflang=en]').getText().toUppercase()).to.include("English".toUppercase());
});
Then('I should see the theme switch', () => {
  expect($('img[alt="Switch theme"]').isExisting()).to.be.equal(true);
});