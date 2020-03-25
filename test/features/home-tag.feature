Feature: Search for articles by tag

    As a visitor of the blog
    I want to list articles by tag
    Because I want to read their contents

    Background:

        Given I am on the blog index page

    Scenario: Listing articles by tag
        When I click on any tag from the tag cloud
        Then I should be presented with the list of clickable articles with selected tag