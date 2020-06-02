Feature: Load comments in the article

    Background:

        Given I open an article with comments

    Scenario: Load comments
        When I wait for comments load
        Then I should see the comment authors and the contents
        Then I should see the comment submit option