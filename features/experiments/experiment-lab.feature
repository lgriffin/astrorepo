Feature: Compare processing variations without overwriting anything
  I want to try a galaxy stretch against a broadband one on the same stack, see both side by side,
  keep the one I like and still have the other, and know exactly how each was made.

  Background:
    Given "M 31" has a stack "result.fit" and Siril_Scripts is installed

  @PE-001 @PE-003
  Scenario: Each variant gets its own folder and the stack is fingerprinted
    When I make an experiment "Stretch test" with a "galaxy" "normal" variant and a "broadband" "strong" variant
    Then the stack's SHA-256 is kept
    And variant "A" writes to "processed/M31-exp1-A" and variant "B" to "processed/M31-exp1-B"

  @PE-002 @PE-003
  Scenario: Running queues one job per variant and records what ran
    Given I made an experiment "Stretch test" with a "galaxy" "normal" variant and a "broadband" "strong" variant
    When I run the experiment
    Then 2 post-process jobs are queued
    And variant "A" ran with "--target=M31-exp1-A"
    When variant "A" finishes and leaves "final.fit"
    And variant "B" fails
    And I run the experiment
    Then only variant "B" is queued again

  @PE-004
  Scenario: A changed stack stops the run
    Given I made an experiment "Stretch test" with a "galaxy" "normal" variant and a "broadband" "strong" variant
    And the stack is stacked again
    When I run the experiment
    Then it is refused because "The stack has changed since the experiment was made, so new results would not compare with the others. Start a new experiment."

  @PE-004
  Scenario: Two identical variants are refused
    When I try to make an experiment "Same" with two "galaxy" "normal" variants
    Then it is refused because "Variants A and B have the same settings, so they would make the same image."

  @PE-005 @PE-006 @PE-007
  Scenario: Compare, prefer one and report
    Given I made an experiment "Stretch test" with a "galaxy" "normal" variant and a "broadband" "strong" variant
    And both variants finished with a final image
    When I compare the experiment
    Then both final images are shown with the same figures and no winner is named
    When I prefer variant "B"
    Then variant "B" is preferred and variant "A" keeps its files
    And the report says variant "B" is preferred and the stack is unchanged
