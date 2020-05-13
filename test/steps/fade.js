const { Given, When, Then } = require("cucumber");

Given("I am on the long-post page", () => {
  browser.url(SITE_URL + "/posts/git-good");
});
When("The browser window is wide", () => {
  browser.setWindowSize(1600, browser.getWindowSize().height);
});
Then("Logo and tag cloud should be visible", () => {
  browser.waitUntil(() => {
    return $(".post-logo").getCSSProperty("visibility").value === "visible";
  })
  expect($(".post-logo").getCSSProperty("visibility").value).to.be.equal("visible");
  expect($(".tag-cloud").getCSSProperty("visibility").value).to.be.equal("visible");
  expect($(".search-bar-container").getCSSProperty("visibility").value).to.be.equal("visible");
});
Then("Social buttons are not visible", () => {
  expect($(".social").getCSSProperty("visibility").value).not.to.be.equal("visible");
});
When("I scroll down more than 50% of the page", () => {
  browser.execute(function() {
    const height = document.querySelector(".content").clientHeight / 2 + 300;
    document.querySelector('.router').scrollTop += height;
  });
});
Then("Logo and tag cloud should be invisible", () => {
  browser.waitUntil(() => {
    return $(".post-logo").getCSSProperty("visibility").value === "hidden";
  })
  expect($(".post-logo").getCSSProperty("visibility").value).to.be.equal("hidden");
  expect($(".tag-cloud").getCSSProperty("visibility").value).to.be.equal("hidden");
  expect($(".search-bar-container").getCSSProperty("visibility").value).to.be.equal("hidden");
});
When("I scroll to the top", () => {
  browser.execute(function() {
    document.querySelector('.router').scrollTop = 0;
  });
});
Then("Social buttons are visible", () => {
  expect($(".social").getCSSProperty("visibility").value).to.be.equal("visible");
});