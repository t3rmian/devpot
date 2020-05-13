Feature: Fade-in-out header and social elements

    Background:

        Given I am on the long-post page

    Scenario: Fade-in-out header and social elements on scroll
        When The browser window is wide    
        When The loading is finished
        Then Logo and tag cloud should be visible
        Then Social buttons are not visible
        When I scroll down more than 50% of the page
        Then Logo and tag cloud should be invisible
        Then Social buttons are visible
        When I scroll to the top
        Then Logo and tag cloud should be visible
        Then Social buttons are not visible
