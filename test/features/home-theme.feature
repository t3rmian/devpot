Feature: Change theme

    As a visitor of the blog
    I want to change the theme
    Because my eyes hurt

    Background:

        Given I am on the blog index page

    Scenario: Changing theme
        When I click on theme change
        Then The theme css changes and saves as cookie