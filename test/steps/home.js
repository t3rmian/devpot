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
    return $('.post-container').isExisting()
  }, 5000, 'Expected loading finish');
  expect(browser.getUrl()).to.be.not.equal(this.previousUrl);
  expect($('body').getText()).to.include(this.articleTitle);
});

When('I type some words in the search input', function () {
  const search = $('[type = "search"]');
  this.keyword = "WebLogic"
  search.setValue(this.keyword);
  const searchButton = $('[type = "search"] + button');
  searchButton.click()
});
Then('I should be presented with the list of clickable articles containing any of the typed words', function () {
  browser.waitUntil(() => {
    return $('.search-header').isExisting()
  }, 5000, 'Expected loading finish');
  expect($('main').getText()).to.include(this.keyword)
  expect($('main table').getText()).to.include(this.keyword)
  expect($$('main a').length).to.be.above(0);
});

When('I type some gibberish in the search input', function () {
  const search = $('[type = "search"]');
  this.keyword = "asdasfsadwefsvxzsdf"
  search.setValue(this.keyword);
  const searchButton = $('[type = "search"] + button');
  searchButton.click()
});
Then('I should be presented with a message that nothing has been found', function () {
  browser.waitUntil(() => {
    return $('.search-header').isExisting()
  }, 5000, 'Expected loading finish');
  expect($('main').getText()).to.include(this.keyword.toUpperCase())
  expect($('main').getText()).to.include("We don't have such content")
  expect($$('main a').length).to.be.equal(0);
});

When('I click on any tag from the tag cloud', function () {
  browser.setWindowSize(1600, browser.getWindowSize().height);
  const tags = $$('.tag-cloud-container a');
  const index = Math.floor(Math.random() * tags.length);
  const selectedTag = tags[index];
  this.selectedTagValue = selectedTag.getText().split("#")[1];
  console.log("CLiuck on " + this.selectedTagValue)
  selectedTag.click()
});
Then('I should be presented with the list of clickable articles with selected tag', function () {
  browser.waitUntil(() => {
    return $('main').isExisting() && $('main').getText().indexOf(this.selectedTagValue.toUpperCase()) >= 0
  }, 5000, 'Expected tag loading finish');
  $$('main a')[0].click();
  browser.waitUntil(() => {
    return $('.tags').isExisting()
  }, 5000, 'Expected article loading finish');
  expect($('.tags').getText()).to.include(this.selectedTagValue);
});