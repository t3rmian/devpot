Feature: Read more

    As a user on the blog
    I want to read more on the index blog page
    Because I want to look at the titles of all articles that have been posted

    Background:

        Given I go to the blog index page

    Scenario: Clicking on 'Read more' action
        When I click "Read more"
        Then I should see a list of all blog article titles