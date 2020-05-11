yarn add --dev @wdio/cli
https://webdriver.io/docs/gettingstarted.html
https://www.guru99.com/cucumber-basics.html
https://webdriver.io/docs/frameworks.html#using-cucumber
step-definitions not step_definitions
yarn add --dev @wdio/cucumber-framework
wdio wdio.conf.js
./node_modules/.bin/wdio wdio.conf.js

 wdio.conf.js:
cucumberOpts: {
        require: ['./features/step_definitions/*.js'],
        
[0-0] Error in "Open the blog index: Clicking on 'Read more' action: Then I should see a list of all blog articles"
        to use the callback interface: do not return a promise
to use the promise interface: remove the last argument to the function