Feature: Sitemap

    Background:

        Given I open sitemap

    Scenario: Display multilang articles but not search nor tags
        Then I should see links to all articles
        Then I should not see links to tags
        Then I should not see links to search