Feature: Proper search filtering

    As a visitor of the blog
    I want to go to search for articles containing specific words
    Because I want to read their contents

    Background:

        Given I go to the blog index page

    Scenario: Searching for an article containing gibberish
        When I type some gibberish in the search input
        Then I should be presented with a message that nothing has been found