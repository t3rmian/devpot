Feature: Read article

    As a visitor of the blog
    I want to go to the index page by pressing the logo
    Because I want to view other articles

    Background:

        Given I go to the blog index page

    Scenario: Clicking on logo redirects to the index page
        When I click on the most recent article page
        Then The article page is loaded
        When I click on the logo
        Then I am redirected to the index page