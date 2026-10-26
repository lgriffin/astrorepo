Feature: Track a campaign until it is finished
  My work on a catalogue, a season or a mosaic is spread across folders and nights. I want a project
  that knows what finished means to me, keeps itself up to date from what is scanned, and tells me
  the one next step for each target.

  Background:
    Given the Messier catalogue holds "M 1", "M 31" and "M 42"

  @AP-004 @AP-001
  Scenario: A catalogue campaign brings its targets in
    When I start a catalogue campaign "Messier marathon" asking for a finished image
    Then the project has 3 targets and 0 of 3 are done
    And the next step for "M 1" is "Capture lights of M 1"

  @AP-002 @AP-003
  Scenario: Progress follows the index without importing anything again
    Given I started a personal collection "Galaxies" of "M 31" asking for 2 h of "L" and a finished image
    And "M 31" has 1 h of usable "L" light
    When the project is worked out
    Then "M 31" has integration not met and published not met
    When "M 31" gains 1 h of usable "L" light and a finished image
    And the project is worked out
    Then "M 31" is done and 1 of 1 are done

  @AP-005
  Scenario: Work that needs no sky comes first
    Given I started a personal collection "Mixed" of "M 1" and "M 42" asking for a finished image
    And "M 1" has 1 h of usable "L" light
    And "M 42" has a stack
    When the project is worked out
    Then the next steps are "Finish an image of M 42 and save it in its images folder" then "Stack M 1: 1.0 h usable"

  @AP-006
  Scenario: A target depth project with two targets is refused
    When I try to start a target depth project "Deep" of "M 1" and "M 31"
    Then it is refused because "A target depth project has exactly one target."

  @AP-008
  Scenario: A paused project suggests nothing
    Given I started a personal collection "Later" of "M 42" asking for a finished image
    When I pause it and the project is worked out
    Then there are no next steps
