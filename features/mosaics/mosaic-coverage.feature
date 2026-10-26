Feature: See how much of my mosaic is covered and what to shoot next
  A panel is not done because one frame touches it. I want to see how much of each panel my solved
  captures really cover and how deep, without a frame counted twice, and a list of what to shoot
  next that a capture tool can read.

  Background:
    Given a mosaic of 1 row by 2 columns at RA 12:00:00 Dec +00:00:00 for target "ngc4565" with a goal of 1 h of "Ha"

  @MO-008 @MO-018
  Scenario: A night solved in the middle of the western panel covers it
    Given a night of 6 lights of "Ha" of 300 s solved at the centre of R1C2
    When coverage is worked out
    Then R1C2 is covered with 30 min of "Ha" toward its goal
    And R1C1 is only partly covered

  @MO-011
  Scenario: One night overlapping both panels is counted once
    Given a night of 6 lights of "Ha" of 300 s solved at the centre of the grid
    When coverage is worked out
    Then both panels are partly covered
    And the mosaic holds 30 min of "Ha" in all

  @MO-022
  Scenario: Lights with no plate solve cannot cover a panel
    Given a night of 6 lights of "Ha" of 300 s not solved yet
    When coverage is worked out
    Then no panel is covered and 1 capture is listed as not solved

  @MO-020
  Scenario: Lights grading rejected add no exposure
    Given a night of 6 lights of "Ha" of 300 s solved at the centre of R1C2
    And grading rejected 2 of them
    When coverage is worked out
    Then R1C2 is covered with 20 min of "Ha" toward its goal

  @MO-021
  Scenario: The next session lists the panels still to shoot
    Given a night of 12 lights of "Ha" of 300 s solved at the centre of R1C2
    When coverage is worked out
    Then the next session lists only R1C1, where the other panel only overlaps it
