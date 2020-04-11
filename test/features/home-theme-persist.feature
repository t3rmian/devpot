Feature: Change theme

    As a visitor of the blog
    I want to change the theme
    Because my eyes hurt

    Background:

        Given I go to the blog index page

    Scenario: Changing theme
        When I click on theme change
        And The theme css changes and is saved as cookie
        And I visit another website
        And I go to the blog index page
        Then The theme css changes and is saved as cookie