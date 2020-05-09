Feature: Open not-existing page on the blog

    Background:

        Given I open non-existing page

    Scenario: Show 404 page
        When The loading is finished
        Then I should see a 404 page
        Then I should see the language switch
        Then I should see the theme switch