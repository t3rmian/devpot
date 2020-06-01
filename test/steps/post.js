const { When, Then } = require("cucumber");

When("I click on the most recent article page", () => {
  waitForUnload();
  $$("main a")[0].click();
});
Then("The article page is loaded", () => {
  waitForUnload('.index-container');
  waitForLoad('.post-container');
  expect($('main[aria-label="Article"]').isExisting()).to.be.equal(true);
});
When("I click on the logo", () => {
    $('header img[alt="Logo"]').click();
});
Then("I am redirected to the index page", () => {
    waitForUnload('.post-container');
    waitForLoad('.index-container');
    expect($('header a[aria-current="page"]').getAttribute("href")).to.be.equal("/");
});