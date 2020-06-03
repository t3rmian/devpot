Feature: Open the blog home page

    As a visitor of the blog
    I want to see the website in a different language
    Because my native language is different

    Background:

        Given I go to the blog index page

    Scenario: I18n of home page
        When I choose the Polish language
        Then I should see the page in the Polish language