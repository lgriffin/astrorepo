Feature: Archiving a finished target
  Once M 42 is stacked and processed, its Siril work folder is mostly intermediates I can
  rebuild. I want to see what each folder costs and whether it can be rebuilt before anything
  is touched, keep the results in an archive folder, and free the space, never touching the
  subs on my NAS.

  Background:
    Given M 42 was stacked in "/work/siril/M42" from two lights hard-linked from "/nas/M42"
    And the work folder also holds Siril's process folder, a failed run, masters and the stack with its manifest
    And it is 21:00 on 9 October 2026
    And archives go in "/archive" and the app only reads "/nas"

  @ARC-001 @ARC-012 @ARC-002
  Scenario: The preview shows each folder's size, what removing it frees and whether it rebuilds
    When I preview the archive of M 42
    Then the archive would be made in "/archive/M 42 2026-10-09"
    And the intermediate folders are:
      | folder  | size | frees | rebuildable |
      | lights  | 18   | 0     | yes         |
      | process | 300  | 300   | yes         |
      | failed  | 7    | 7     | no          |
    And nothing on disk has changed

  @ARC-004 @ARC-009 @ARC-010 @NFR-016
  Scenario: A linked archive keeps the results and frees the folders I ticked
    When I archive M 42 linked, removing process and failed
    Then the archive folder holds:
      | astrorepo-archive.json        |
      | masters/dark_stacked.fit      |
      | result_60s.fit                |
      | result_60s.fit.astrorepo.json |
    And the archive index names the raw frames "/nas/M42/Light_001.fit" and "/nas/M42/Light_002.fit"
    And the work folder no longer has process or failed
    And "/nas/M42" still holds Light_001.fit and Light_002.fit
    And M 42's record says linked, removed failed and process, freeing 307 bytes

  @ARC-007
  Scenario Outline: Archiving is refused when the archive folder <problem>
    Given <setup>
    When I try to archive M 42 linked
    Then the archive is refused, saying "<reason>"
    And no archive folder was made

    Examples:
      | problem             | setup                                          | reason             |
      | is already there    | today's archive folder already exists          | already exists     |
      | is somewhere I read | archives go in "/nas/archive"                  | only reads         |
      | lacks the room      | the archive disk has 10 bytes free             | short of the space |

  @ARC-008
  Scenario: A stack still queued for M 42 blocks the archive
    Given a stack of M 42 is queued in Jobs
    When I preview the archive of M 42
    Then the preview says "A job for this target is queued or running. Let it finish, or cancel it in Jobs, then archive."
    When I try to archive M 42 linked
    Then the archive is refused, saying "queued or running"
    And no archive folder was made

  @ARC-001
  Scenario: A target with no raw folder has nothing to archive
    Given M 42 has no raw folder
    When I preview the archive of M 42
    Then the preview says "This target has no raw folder, so it has no work folder to archive."

  @ARC-011
  Scenario: An archived target drops out of the stacking suggestions until new subs arrive
    Given M 42 has 3 hours of subs that are ready to stack
    Then the cockpit suggests stacking M 42
    When I archive M 42 linked, removing nothing
    Then the cockpit does not suggest stacking M 42
    When I shoot more subs of M 42
    Then the cockpit suggests stacking M 42
