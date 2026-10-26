Feature: Know what another hour of capture buys
  I have hours of light on a target, but not all of it is good. I want to see what I captured apart
  from what I kept, and an honest forecast of what more capture would buy, with what it rests on.

  Background:
    Given "M 31" has 9 kept and 3 rejected lights of 300 s in "Ha"

  @AI-001
  Scenario: Captured and kept stand apart
    When the integration of "M 31" is described
    Then "Ha" has 1 h acquired and 45 min accepted

  @AI-002 @AI-008
  Scenario: A forecast comes with its assumptions
    When the integration of "M 31" is described for 60 minutes
    Then "Ha" is forecast "theoretical" with an expected 45 min accepted
    And the forecast says new capture is accepted at "75% of 12 frames"

  @AI-003
  Scenario: Nothing kept means no number
    Given "M 31" has 2 rejected lights of 300 s in "OIII"
    When the integration of "M 31" is described for 60 minutes
    Then "OIII" is forecast "insufficient data" with no number

  @AI-004
  Scenario: Rejecting a frame by hand changes the forecast at once
    When the integration of "M 31" is described for 60 minutes
    And I reject one more "Ha" light by hand
    And the integration of "M 31" is described for 60 minutes
    Then "Ha" is forecast "theoretical" with an expected 40 min accepted

  @AI-005 @AI-006
  Scenario: A goal says how long is left and the filter an hour helps most leads
    Given the goal for "M 31" in "Ha" is 2 h
    And "M 31" has 24 kept lights of 300 s in "OIII"
    When the integration of "M 31" is described
    Then "Ha" still needs "1 h 15 min" of accepted light
    And the best filter for the next hour is "Ha"
