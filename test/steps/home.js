const { Given, When, Then } = require('cucumber');

Given('I am on the blog index page', function () {
  browser.url(SITE_URL);
});
Then('I should see a list of 5 article titles at most', function () {
  expect($$('.date-col').length).to.be.below(6)
});

When('I click "Read more"', function () {
  $('.more button').click();
});
Then('I should see a list of all blog article titles', function () {
  expect($$('.date-col').length).to.be.above(5)
});

When('I click on any article on home page', function () {
  const index = Math.floor(Math.random() * 4);
  const article = $$('.date-col+td a')[index];
  this.previousUrl = browser.getUrl();
  this.articleTitle = article.getText();
  article.click();
});
Then('I should be redirected to the article site with its contents', function () {
  browser.waitUntil(() => {
    return $('.post-container') != null
  }, 5000, 'Expected loading finish');
  expect(browser.getUrl()).to.be.not.equal(this.previousUrl);
  expect($('body').getText()).to.include(this.articleTitle);
});