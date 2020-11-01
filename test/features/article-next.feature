Feature: Display next article

    Background:

        Given I go to the blog index page

    Scenario: Open the first article scroll down click on the next article and read it
        When The loading is finished
        When I click "Read more"
        When I open last article
        When The loading is finished
        When I scroll to the bottom
        Then I should see a link to a next article
        When I click a link to a next article
        When The loading is finished
        Then I should see the next article
