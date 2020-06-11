const { Given, When, Then } = require('cucumber');

Given('I go to the blog index page', () => {
  browser.url(SITE_URL);
  waitForUnload();
});
Then('I should see a list of 5 article titles at most', () => {
  expect($$('.date-col').length).to.be.below(6)
});

When('I click "Read more"', () => {
  $('.more button').click();
});
Then('I should see a list of all blog article titles', () => {
  expect($$('.date-col').length).to.be.above(5)
});

When('I click on any article on home page', () => {
  const index = Math.floor(Math.random() * 4);
  const article = $$('.date-col+td a')[index];
  this.previousUrl = browser.getUrl();
  this.articleTitle = article.getText();
  article.click();
});
Then('I should be redirected to the article site with its contents', () => {
  waitForLoad(".post-container")
  expect(browser.getUrl()).to.be.not.equal(this.previousUrl);
  expect($('body').getText()).to.include(this.articleTitle);
});

When('I type some words in the search input', () => {
  const search = $('[type = "search"]');
  this.keyword = "WebLogic"
  search.setValue(this.keyword);
  const searchButton = $('[type = "search"] + button');
  searchButton.click()
});
Then('I should be presented with the list of clickable articles containing any of the typed words', () => {
  waitForUnload();
  expect($('main').getText()).to.include(this.keyword)
  expect($('main table').getText()).to.include(this.keyword)
  expect($$('main a').length).to.be.above(0);
});

When('I type some gibberish in the search input', () => {
  const search = $('[type = "search"]');
  this.keyword = "asdasfsadwefsvxzsdf"
  search.setValue(this.keyword);
  const searchButton = $('[type = "search"] + button');
  searchButton.click()
});
Then('I should be presented with a message that nothing has been found', () => {
  browser.waitUntil(() => {
    return $('.search-header').isExisting()
  }, 5000, 'Expected loading finish');
  expect($('main').getText()).to.include(this.keyword.toUpperCase())
  expect($('main').getText()).to.include("We don't have such content")
  expect($$('main a').length).to.be.equal(0);
});

When('I click on any tag from the tag cloud', () => {
  browser.setWindowSize(1600, browser.getWindowSize().height);
  waitForUnload();
  const tags = $$('.tag-cloud-container a');
  const index = Math.floor(Math.random() * tags.length);
  const selectedTag = tags[index];
  this.selectedTagValue = selectedTag.getText().split("#")[1];
  selectedTag.click()
});
Then('I should be presented with the list of clickable articles with selected tag', () => {
  browser.waitUntil(() => {
    return $('main').isExisting() && $('main').getText().toUpperCase().indexOf(this.selectedTagValue.toUpperCase()) >= 0
    && $$('main a').length > 0
  }, 5000, 'Expected tag loading finish');
  waitForUnload();
  $$('main a')[0].click();
  waitForUnload();
  expect($('.tags').getText().toUpperCase()).to.include(this.selectedTagValue.toUpperCase());
});

When('I choose the Polish language', () => {
  $('a[hreflang=pl]').click();
});
Then('I should see the page in the Polish language', () => {
  browser.setWindowSize(1600, browser.getWindowSize().height);
  waitForUnload();
  browser.waitUntil(() => {
    return $('body').getText().includes("Najnowsze".toUpperCase());
  }, 5000, 'Expected loading finish');
  expect($('body').getText()).to.include("Najnowsze".toUpperCase());
  expect($('body').getText()).to.include("Więcej");
  expect($('body').getText()).to.include("Głodny");
  expect($('body').getText()).to.match(/Sty|Lut|Mar|Kwi|Maj|Cze|Lip|Sie|Wrz|Paz|Lis|Gru/g);
  expect($$('.date-col+td a')[0].getUrl()).to.include("/pl/");
  expect($$('.tag-cloud-container a')[0].getUrl()).to.include("/pl/");
});

When('I click on theme change', () => {
  $('.theme-switcher > img').click();
});
Then('The theme css changes and is saved as cookie', () => {
  browser.waitUntil(() => {
    return $('.theme-dark').isExisting()
  }, 5000, 'Expected loading finish');
  const themeCookies = browser.getCookies(['theme'])
  expect(themeCookies.length).to.be.above(0);
  expect(themeCookies[0].value).to.be.equal('theme-dark');
});

Then('I visit another website', () => {
  browser.url("https://google.com");
});