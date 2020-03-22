Feature: Read article

    As a visitor of the blog
    I want to go to a selected article
    Because I want to read its contents

    Background:

        Given I am on the blog index page

    Scenario: Clicking on any article title on home page
        When I click on any article on home page
        Then I should be redirected to the article site with its contents