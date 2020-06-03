const { Given, When, Then } = require('cucumber');

Given('I open an article with comments', () => {
  browser.url(SITE_URL + "/posts/ins-30014/");
  waitForUnload();
});
When('I wait for comments load', () => {
  waitForLoad('#comments iframe');
  browser.switchToFrame($('#comments iframe'));
  waitForLoad('article:first-of-type');
});
Then('I should see the comment authors and the contents', () => {
  browser.waitUntil(
    () => {
      return $('main').getText().includes("t3rmian commented")
    },
    5000,
    "Expected loading finish"
  );
  expect($('main').getText()).to.include("t3rmian commented")
  expect($('main').getText()).to.include("Start the TNS Listener service")
});
Then('I should see the comment submit option', () => {
  browser.waitUntil(
    () => {
      $('main').getText().includes("Sign in to comment")
    },
    5000,
    "Expected loading finish"
  );
  expect($('main').getText()).to.include("Sign in to comment");
});