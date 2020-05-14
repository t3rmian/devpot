Feature: Fade-in-out header and social elements on a long narrow page

    Background:

        Given I am on the long-post page

    Scenario: Fade-in-out header and social elements on scroll on a long-narrow page
        When The browser window is narrow
        When The loading is finished
        Then Logo and search should be visible
        Then Tag cloud should be invisible
        Then Social buttons are not visible
        When I scroll down more than 50% of the page
        Then Logo and search should be invisible
        Then Tag cloud should be invisible
        Then Social buttons are not visible
        When I scroll to the bottom
        Then Social buttons are visible
        Then Social buttons are static
        When I scroll to the top
        Then Logo and search should be visible
        Then Tag cloud should be invisible
        Then Social buttons are not visible