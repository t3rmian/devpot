Feature: Open page with source link

    Background:

        Given I open page with source link

    Scenario: Article displays source link
        When The loading is finished
        When I scroll to the bottom
        Then I should see source link