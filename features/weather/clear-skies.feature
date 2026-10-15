Feature: Clear skies for the next three nights
  Before I carry the scope out I want to know, at a glance on Home, whether tonight and the next
  two nights look clear at my site. My own weather station's service knows my garden better than
  any model, so what it says about tonight counts too.

  Background:
    Given my site is on the Greenwich meridian
    And it is 15:00 UTC on 15 October 2026
    And each night is dark from 20:00 to 04:00 UTC

  @WX-001 @WX-002
  Scenario: A clear night says "Clear skies", a broken one gives its clear spell, an overcast one is cloudy
    Given the forecast gives this cloud cover, hour by hour from dusk:
      | night      | cloud by hour                  |
      | 2026-10-15 | 5, 5, 10, 10, 15, 20, 10, 5    |
      | 2026-10-16 | 90, 80, 10, 10, 10, 85, 90, 95 |
      | 2026-10-17 | 95, 100, 100, 90, 90, 95, 100, 100 |
    When I open Home
    Then the nights read:
      | night      | verdict      |
      | 2026-10-15 | Clear skies  |
      | 2026-10-16 | Clear spells |
      | 2026-10-17 | Cloudy       |
    And the clear spell on 2026-10-16 runs from 22:00 to 01:00 UTC

  @WX-004
  Scenario: My weather service gives rain a high chance, so a clear forecast is held back
    Given the forecast gives 5% cloud all night, every night
    And my weather service is at "http://nas.local:1456"
    And my weather service gives tonight a 70% chance of rain and a 40% chance of frost
    When I open Home
    Then the nights read:
      | night      | verdict      |
      | 2026-10-15 | Clear spells |
      | 2026-10-16 | Clear skies  |
      | 2026-10-17 | Clear skies  |
    And tonight says "The forecast is clear, but your weather service gives rain a 70% chance."

  @WX-006
  Scenario: The forecast cannot be reached, so my weather service's own cloud cover decides tonight
    Given the forecast cannot be reached
    And my weather service is at "http://nas.local:1456"
    And my weather service gives tonight 10% cloud
    When I open Home
    Then the nights read:
      | night      | verdict         |
      | 2026-10-15 | Clear skies     |
      | 2026-10-16 | No forecast yet |
      | 2026-10-17 | No forecast yet |
    And Home says "Open-Meteo could not be used: could not be reached (ENOTFOUND)"

  @WX-005
  Scenario: A mistyped service address is not called
    Given the forecast gives 5% cloud all night, every night
    And my weather service is at "nas.local:1456"
    When I open Home
    Then Home says "Your weather service could not be used: \"nas.local:1456\" is not an http or https address, such as http://nas.local:1456"
    And tonight reads "Clear skies"

  @WX-010
  Scenario: With the forecast turned off and no service, Home says the weather is off
    Given the public forecast is turned off
    When I open Home
    Then Home says the weather is off
