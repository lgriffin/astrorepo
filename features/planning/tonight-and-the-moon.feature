Feature: What to shoot tonight, and what the moon allows
  I plan around the moon and the seasons. With the Vespera Pro and a dual-band filter I can
  still shoot emission nebulae under a bright moon, but galaxies have to wait. I want tonight's
  list ranked by usable hours, a warning when a target's season is closing, and the next new
  moon windows with what to shoot in them.

  Background:
    Given my site is London
    And I have a dual-band filter
    And these targets have work left:
      | target   | RA hours | Dec    | type             | subs of 5 min | first night          | goal hours |
      | M 31     | 0.71     | 41.27  | galaxy           | 12            | 2026-09-20T21:00:00Z | 10         |
      | NGC 7000 | 20.98    | 44.33  | emission_nebula  | 12            | 2026-09-21T21:00:00Z |            |
      | M 13     | 16.69    | 36.46  | globular_cluster | 24            | 2026-08-01T21:00:00Z |            |
    And M 45 is already past its 1 hour goal
    And the new moons fall at "2026-10-10T15:50:36Z", "2026-11-09T07:02:42Z" and "2026-12-09T00:52:31Z"
    And it is 15:00 UTC on 29 September 2026

  @FWD-007
  Scenario: With no site set, the plan tells me what to set instead of guessing
    Given no observing site is set
    When I open the plan
    Then it asks me to set my site
    And no night's sky was worked out

  @FWD-006
  Scenario: On a moonless night tonight's list has every target with work left, most hours first
    When I open the plan
    Then tonight is the night of 2026-09-29
    And tonight's list holds M 13, M 31 and NGC 7000, most usable hours first
    And M 45 is not on tonight's list

  @FWD-005
  Scenario: Under a bright moon, the dual-band filter keeps the emission nebula on the list
    Given tonight the moon is up and 88% lit
    When I open the plan
    Then tonight's list is only NGC 7000

  @FWD-005
  Scenario: Under a bright moon without a narrowband filter, nothing is suggested and I'm told why
    Given tonight the moon is up and 88% lit
    And I have no dual-band or narrowband filter
    When I open the plan
    Then tonight's list is empty
    And the plan says a narrowband filter is missing for the bright moon

  @FWD-002
  Scenario: M 13 sinking into the west is flagged as closing; the autumn targets are not
    When I open the plan
    Then only M 13's season is closing, within 30 days

  @FWD-004
  Scenario: Each new moon in the next 90 days gets a dark window of three nights either side
    # The November and December new moons fall after midnight UTC, so in London's night before.
    When I open the plan
    Then the dark windows are:
      | new moon night | from       | to         |
      | 2026-10-10     | 2026-10-07 | 2026-10-13 |
      | 2026-11-08     | 2026-11-05 | 2026-11-11 |
      | 2026-12-08     | 2026-12-05 | 2026-12-11 |
    And the best target in the December window is M 31

  @FWD-008
  Scenario: A night that only gets nautically dark is still planned, and says so
    Given tonight the sun only gets 12° below the horizon
    When I open the plan
    Then tonight's darkness is "nautical"

  @FWD-008
  Scenario: A night with no dark window has no tonight plan, but the seasons still stand
    Given tonight the sun never gets 12° below the horizon
    When I open the plan
    Then there is no plan for tonight
    And the seasons are shown for M 13, M 31 and NGC 7000
