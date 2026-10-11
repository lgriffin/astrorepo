Feature: Where my frames point, and planning mosaics
  M 31 is far bigger than the Seestar's field, so I shoot it as panels, sometimes filed under
  different target names. I want the app to plate solve one light per night with ASTAP, warn me
  when a target's frames point somewhere else, show the field rotation between nights, and plan
  a mosaic grid with the panels I still need.

  Background:
    Given the catalogue has M 31 at RA 10.6847° Dec 41.2688°, 178 arcmin across, with a 6 hour goal
    And the catalogue has "M 31 panel 2" with no position
    And my site is London

  @SKY-003
  Scenario: Asking to plate solve M 31 queues one job for a light per night and the master
    Given ASTAP and Siril are installed
    And M 31 has lights from the nights of 1 and 2 October 2026 and a stacked master
    When I ask to plate solve M 31
    Then one job is queued in Jobs: "Plate solve M 31 with ASTAP (3 files)"
    And it says "3 files queued in Jobs to plate solve with ASTAP."
    And each file is solved near M 31's catalogue position

  @SKY-002
  Scenario: With neither ASTAP nor Siril installed, nothing is queued and I'm told what to install
    Given no plate solver is installed
    And M 31 has lights from the nights of 1 and 2 October 2026 and a stacked master
    When I ask to plate solve M 31
    Then nothing is queued
    And it says "Neither ASTAP nor Siril is set up, so nothing can be plate solved. Install ASTAP (preferred) or Siril, or set where one is in Settings → Tools."

  @SKY-004
  Scenario: A light that already carries a WCS is placed from its headers without solving
    Given ASTAP and Siril are installed
    And M 31's only light already carries a WCS centred at RA 10.7° Dec 41.3°
    When I ask to plate solve M 31
    Then nothing is queued
    And the light is placed at RA 10.7° from its headers

  @SKY-005
  Scenario: Lights filed as M 31 that point at Orion are flagged as possibly misfiled
    Given M 31's lights from 2 nights solved at RA 83.8° Dec -5.4°
    When I open M 31's sky page
    Then it warns that 2 of 2 solved files point far from M 31

  @SKY-006
  Scenario: The field rotation is shown for each night, with the spread between them
    Given M 31's light from 1 October 2026 solved with rotation 0°
    And M 31's light from 2 October 2026 solved with rotation 10°
    When I open M 31's sky page
    Then the rotation is 0° on 2026-10-01 and 10° on 2026-10-02, a spread of 10°
    And it does not warn about misfiling

  @SKY-007 @SKY-008
  Scenario: Planning M 31 with the Seestar's field gives a 5 by 3 grid and marks the coming nights
    When I plan a mosaic of M 31 with a 0.72° by 1.28° field
    Then the plan has 5 columns and 3 rows
    And tile 1 has nothing yet and needs 6 hours
    And the next 10 nights are marked, starting 2026-10-09

  @SKY-010
  Scenario Outline: A mosaic cannot be planned when <what> is missing
    When I plan a mosaic of <target> <with field>
    Then the planner says "<status>"

    Examples:
      | what     | target         | with field                     | status      |
      | position | "M 31 panel 2" | with a 0.72° by 1.28° field    | no-position |
      | field    | M 31           | without choosing equipment     | no-field    |
      | target   | "M 999"        | with a 0.72° by 1.28° field    | no-target   |

  @SKY-008
  Scenario: Without a site the mosaic is still planned, but no nights are marked
    Given no observing site is set
    When I plan a mosaic of M 31 with a 0.72° by 1.28° field
    Then the plan has 5 columns and 3 rows
    And no nights are marked
