Feature: Change theme

    As a visitor of the blog
    I want to change the theme
    Because my eyes hurt

    Background:

        Given I go to the blog index page

    Scenario: Changing theme
        When I click on theme change
        Then The theme css changes and is saved as cookie