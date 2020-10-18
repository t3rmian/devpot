Feature: Open the blog home page

    As a visitor of the blog
    I want to see 5 most recent articles by default
    Because I want to know what's been added only recently

    Background:

        Given I go to the blog index page

    Scenario: Visiting site for the first time
        Then I should see a list of 10 article titles at most