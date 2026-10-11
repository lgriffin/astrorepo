Feature: Stacks run in the night window, one at a time
  Stacking a few hundred Seestar subs ties the PC up for most of an hour, so I queue stacks
  to run between 02:00 and 03:00 when nobody is using it. A job must wait for the window, for
  the PC to be idle and quiet, and for disk space, and tell me which. Run now jumps all of that.

  Background:
    Given the run window is 02:00 to 03:00, a job waits for 10 idle minutes and CPU under 30%
    And the work disk has 100 GB free

  @JOB-002
  Scenario: A stack queued in the afternoon waits for the window to open
    Given it is 14:00 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    Then nothing starts
    And the M 42 stack waits for the window, which opens at 02:00 on 1 October 2026

  @JOB-004 @JOB-009
  Scenario: In the window with the PC idle, the stack lays out its frames, runs Siril and succeeds
    Given it is 02:30 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    Then Siril starts on the M 42 stack after Prep for Siril
    When Siril prints "Stacking 40 images" and exits with code 0 at 02:50
    Then the M 42 stack has succeeded
    And its log reads "Prep for Siril: 30 linked, 2 copied, 1 already in place."
    And its log reads "Stacking 40 images"

  @JOB-003
  Scenario Outline: A window stack waits while the PC is <why>
    Given it is 02:30 on 30 September 2026
    And the PC was last used <idle> seconds ago and its CPU is at <cpu>%
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    Then nothing starts
    And the M 42 stack waits because of "<code>"

    Examples:
      | why    | idle | cpu | code |
      | in use | 30   | 5   | idle |
      | busy   | 3600 | 80  | cpu  |

  @JOB-005
  Scenario: A long stack that would run past 03:00 lets a shorter one go first
    Given it is 02:30 on 30 September 2026
    And I queued a window stack of M 31 needing 30 GB
    And I queued a window stack of M 42 needing 5 GB
    When the job runner checks the queue
    Then Siril starts on the M 42 stack
    And the M 31 stack waits for the next window because it would overrun the close at 03:00

  @JOB-007
  Scenario: A stack waits when the disk has filled up since I queued it
    Given it is 02:30 on 30 September 2026
    And the work disk has 0.5 GB free
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    Then nothing starts
    And the M 42 stack waits for space, 0.5 GB short

  @JOB-011
  Scenario: Run now starts a stack in the afternoon, whatever the window
    Given it is 14:00 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When I choose Run now for the M 42 stack
    And the job runner checks the queue
    Then Siril starts on the M 42 stack

  @JOB-010
  Scenario: Cancelling a queued stack takes it off the queue without running it
    Given it is 14:00 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When I cancel the M 42 stack
    And it is 02:30 on 1 October 2026
    And the job runner checks the queue
    Then nothing starts
    And the M 42 stack is cancelled

  @JOB-009
  Scenario: When Siril fails, the job fails with its exit code in the note and the log
    Given it is 02:30 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    And Siril prints "Not enough disk space" and exits with code 1 at 02:40
    Then the M 42 stack has failed with exit code 1
    And its log reads "failed (exit code 1)"

  @JOB-001
  Scenario: Confirming the full colour script for lights with no calibration frames is refused
    Given it is 20:00 on 29 September 2026
    And "D:/astro/M 42" holds 40 colour lights and no calibration frames
    When I confirm a window stack of M 42 from "D:/astro/M 42" with "OSC_Preprocessing"
    Then the stack is refused because "OSC_Preprocessing needs biases, flats"
    And nothing is queued

  @JOB-001
  Scenario: Confirming the lights-only script for the same lights queues a window job
    Given it is 20:00 on 29 September 2026
    And "D:/astro/M 42" holds 40 colour lights and no calibration frames
    When I confirm a window stack of M 42 from "D:/astro/M 42" with "OSC_Preprocessing_WithoutDBF"
    Then a window job "Stack M 42 with OSC_Preprocessing_WithoutDBF" is queued to run Siril in "D:/work/siril/M 42"
