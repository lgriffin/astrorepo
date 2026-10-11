Feature: What is ready to stack
  I shoot with a Seestar S50 from the back garden and stack in Siril. After a run of clear
  nights I don't want to add up integration by hand: the cockpit should tell me which targets
  have enough subs to be worth a Siril run, which have grown enough since I last stacked them,
  and let me put a suggestion aside until something actually changes.

  @DSC-010
  Scenario: Two clear nights on M 81 are worth stacking
    Given I shot 432 subs of 10 seconds of M 81 from "2026-03-01T21:00:00Z"
    And I shot 360 subs of 10 seconds of M 81 from "2026-03-02T21:00:00Z"
    When I open the cockpit
    Then it suggests stacking M 81: 2 h 12 m from 792 subs over 2 nights

  @DSC-010
  Scenario: An hour on the Crab is not enough yet
    Given I shot 360 subs of 10 seconds of M 1 from "2026-03-01T21:00:00Z"
    When I open the cockpit
    Then it does not suggest anything for M 1

  @DSC-012
  Scenario: A session that runs past midnight is one night, not two
    Given I shot 1440 subs of 10 seconds of M 51 from "2026-04-10T22:00:00Z"
    When I open the cockpit
    Then it suggests stacking M 51: 4 h from 1440 subs over 1 night

  @DSC-004
  Scenario: New subs since my last stack earn a restack
    Given I shot 1080 subs of 10 seconds of M 101 from "2026-03-01T21:00:00Z"
    And Siril wrote a stack of M 101 on "2026-03-05T09:00:00Z"
    And I shot 480 subs of 10 seconds of M 101 from "2026-03-10T21:00:00Z"
    When I open the cockpit
    Then it suggests restacking M 101 with 1 h 20 m added since that stack

  @DSC-004
  Scenario: Twenty minutes since the last stack is not worth a restack
    Given I shot 1080 subs of 10 seconds of M 42 from "2026-01-01T21:00:00Z"
    And Siril wrote a stack of M 42 on "2026-01-05T09:00:00Z"
    And I shot 120 subs of 10 seconds of M 42 from "2026-01-08T21:00:00Z"
    When I open the cockpit
    Then it does not suggest anything for M 42

  @DSC-011
  Scenario: The target with the most waiting integration comes first
    Given I have shot:
      | target | subs | exposure | from                 |
      | M 51   | 1080 | 10       | 2026-03-01T21:00:00Z |
      | M 81   | 2952 | 10       | 2026-03-01T21:00:00Z |
      | M 106  | 900  | 20       | 2026-03-03T21:00:00Z |
    When I open the cockpit
    Then the suggestions are in this order: M 81, M 106, M 51

  @DSC-008
  Scenario: A dismissed suggestion stays away until the target gets new subs
    Given I shot 1440 subs of 10 seconds of M 81 from "2026-03-01T21:00:00Z"
    And I shot 1080 subs of 10 seconds of M 51 from "2026-03-01T21:00:00Z"
    When I dismiss the suggestion to stack M 81
    Then the suggestions are in this order: M 51
    When I shot 360 subs of 10 seconds of M 81 from "2026-03-09T21:00:00Z"
    Then the suggestions are in this order: M 81, M 51

  @DSC-008
  Scenario: Dismissing a suggestion that is no longer there sets nothing aside
    Given I shot 1440 subs of 10 seconds of M 81 from "2026-03-01T21:00:00Z"
    When I dismiss the suggestion to stack M 33
    Then nothing was set aside

  @DSC-009
  Scenario Outline: The cockpit works out how far along <target> is from its files
    Given <target> has a goal of <goal> hours, <subs> subs of 10 seconds, <stacks> stacks, <processed> processed and <finished> finished images
    When I open the cockpit
    Then <target> is shown as "<state>"

    Examples:
      | target   | goal | subs | stacks | processed | finished | state       |
      | M 31     | 6    | 0    | 0      | 0         | 0        | planned     |
      | M 45     | 0    | 10   | 0      | 0         | 0        | capturing   |
      | M 81     | 0    | 2952 | 0      | 0         | 0        | enough-data |
      | M 42     | 0    | 100  | 1      | 0         | 0        | stacked     |
      | NGC 7000 | 0    | 2952 | 1      | 2         | 0        | processed   |
      | M 1      | 0    | 0    | 0      | 0         | 1        | final       |

  @DSC-017
  Scenario: With no observing site set, next actions still list my stacking
    Given I shot 1440 subs of 10 seconds of M 81 from "2026-03-01T21:00:00Z"
    And no observing site is set
    When I look at next actions
    Then next actions are: stack M 81
    And no planning failure is recorded

  @DSC-017
  Scenario: When the sky calculations fail, stacking still shows and the failure is recorded
    Given I shot 1440 subs of 10 seconds of M 81 from "2026-03-01T21:00:00Z"
    And the forward plan fails with "ephemeris down"
    When I look at next actions
    Then next actions are: stack M 81
    And the planning failure "ephemeris down" is recorded
