const { Given, When, Then } = require("cucumber");

Given("I am on the long-post page", () => {
  browser.url(SITE_URL + "/posts/git-good");
});
Given("I am on the short-post page", () => {
  browser.url(SITE_URL + "/posts/ejb-in-jmeter");
});
When("The browser window is wide", () => {
  browser.setWindowSize(1600, 800);
});
When("The browser window is narrow", () => {
  browser.setWindowSize(800, 800);
});
When("The browser window is mobile landscape", () => {
  browser.setWindowSize(1600, 500);
});
Then("Logo and search should be visible", () => { 
  browser.waitUntil(() => {
    return $(".post-logo").isDisplayedInViewport() === true; 
  })
  expect($(".post-logo").isDisplayedInViewport()).to.be.equal(true);
  expect($(".search-bar-container").isDisplayedInViewport()).to.be.equal(true);
});
Then("Tag cloud should be visible", () => { 
  expect($(".tag-cloud").isDisplayedInViewport()).to.be.equal(true);
  expect($(".tag-cloud").isDisplayed()).to.be.equal(true);
});
Then("Social buttons are not visible", () => {
  browser.waitUntil(() => {
    return $(".social").isDisplayedInViewport() === false; 
  })
  expect($(".social").isDisplayedInViewport()).to.be.equal(false);
});
When("I scroll down more than 50% of the page", () => {
  browser.execute(function() {
    const height = document.querySelector(".content").clientHeight / 2 + 300;
    document.querySelector('.router').scrollTop += height;
  });
});
Then("Logo and search should be invisible", () => {
  browser.waitUntil(() => {
    return $(".post-logo").isDisplayedInViewport() === false;
  })
  expect($(".post-logo").isDisplayedInViewport()).to.be.equal(false);
  expect($(".search-bar-container").isDisplayedInViewport()).to.be.equal(false);
});
Then("Tag cloud should be invisible", () => { 
  expect($(".tag-cloud").isDisplayedInViewport()).to.be.equal(false);
});
When("I scroll to the top", () => {
  browser.execute(function () {
    document.querySelector('.router').scrollTop = 0;
  });
});
When("I scroll to the bottom", () => {
  browser.execute(function () {
    document.querySelector(".router").scrollTop = 9999999;
  });
});
Then("Social buttons are visible", () => {
  browser.waitUntil(() => {
    browser.execute(function () {
      document.querySelector('.router').scrollTop += 100;
    });
    return $(".social").isDisplayedInViewport() === true; 
  })
  expect($(".social").isDisplayedInViewport()).to.be.equal(true);
});
Then("Social buttons are fixed", () => {
  expect($(".social").getCSSProperty("position").value).to.be.equal("fixed");
});
Then("Social buttons are static", () => {
  expect($(".social").getCSSProperty("position").value).to.be.equal("static");
});