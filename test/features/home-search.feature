Feature: Search for an article

    As a visitor of the blog
    I want to go to search for articles containing specific words
    Because I want to read their contents

    Background:

        Given I go to the blog index page

    Scenario: Searching for an article containing any of the words
        When I type some words in the search input
        Then I should be presented with the list of clickable articles containing any of the typed words