Feature: Bringing a night in from the Vespera Pro
  After a night on the Vespera Pro I join its Wi-Fi and want to see every session on it, what
  each one is of, and whether its files look complete, then copy the ones I want into my
  repository with one button, into a folder whose name says what it holds. The scope is only
  ever read: nothing on it is written, renamed or deleted.

  @VIN-001 @VIN-002 @VIN-006
  Scenario: My scope's sessions are listed newest first, from listings alone
    Given my scope holds the sessions Leigh's Vespera listed on 14 October 2026
    When I scan the scope
    Then I see 17 sessions, newest first, starting with "2024-07-16_20-40-47_observation_moon"
    And 3 are auto-init and 2 are sun-mode sessions
    And "2024-06-16_01-12-12_observation_M8_M20_10_18" has the label "M8_M20_10_18"
    And the scan says expert-mode darks are on the scope
    And nothing was read from the scope, only listed

  @VIN-003
  Scenario: An old folder with no date in its name is still a session
    Given my scope holds "01-observation-eagle-15-15" with 2 FITS frames, both stacked
    When I scan the scope
    Then "01-observation-eagle-15-15" is a session of kind "unknown" with the finding "info:NO_TIMESTAMP"

  @VIN-007 @VIN-008 @VIN-009
  Scenario: A cloudy night with a lost frame is counted and flagged
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2, 3 and 5, frames 1 and 5 stacked
    When I scan the scope
    Then "2024-06-15_21-00-54_observation_NGC3372" counts 4 FITS, 0 TIFF, 2 JPEG and 5 JSON
    And its findings are:
      | warn:NO_TIFF       |
      | info:FITS_GT_JPEG  |
      | warn:GAP_IN_FRAMES |
    And Transfer is on for it

  @VIN-010 @VIN-012
  Scenario: A session with no label is named from its stacked JPEG
    Given my scope holds "01-observation-x" whose last stacked JPEG's EXIF says "Jellyfish Nebula, 40 frames"
    When I scan the scope and identify "01-observation-x"
    Then its target is "IC 443" from the "exif"

  @VIN-011 @VIN-014 @VIN-015
  Scenario: A session nothing names waits for me to name it
    Given my scope holds "01-observation-x" with 2 FITS frames, both stacked
    When I scan the scope and identify "01-observation-x"
    Then its target is "Unknown" from the "unknown"
    And Transfer is refused for it
    When I name it "m 42"
    Then its target is "M 42" from the "manual"
    And Transfer is on for it

  @VIN-016 @VIN-019 @VIN-020 @VIN-025 @VIN-026
  Scenario: One press copies the FITS into the target's folder, in a folder named for what it holds
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2 and 3, frames 1 and 3 stacked
    When I scan the scope and transfer "2024-06-15_21-00-54_observation_NGC3372" to "/repo"
    Then the transfer is done
    And "/repo/NGC3372/NGC3372_2024-06-15_FIT=3" holds:
      | 01-images-initial/img-0001.fits |
      | 01-images-initial/img-0002.fits |
      | 01-images-initial/img-0003.fits |
      | astrorepo.manifest.json         |
      | astrorepo.transfer.json         |
    And the manifest lists 3 files, each with a SHA-256
    And the scope was never sent a command that changes anything

  @VIN-022 @VIN-023 @VIN-024
  Scenario: The Wi-Fi drops part way and the copy carries on where it stopped
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2 and 3, frames 1 and 3 stacked
    And the Wi-Fi drops after 50 bytes
    When I scan the scope and transfer "2024-06-15_21-00-54_observation_NGC3372" to "/repo"
    Then the transfer is paused
    When I resume the transfer
    Then the transfer is done
    And the interrupted file was resumed from byte 10, not fetched again

  @VIN-018
  Scenario: A folder of the same name from another session is never copied into
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2 and 3, frames 1 and 3 stacked
    And "/repo/NGC3372/NGC3372_2024-06-15_FIT=3" already holds another session's copy
    When I scan the scope and transfer "2024-06-15_21-00-54_observation_NGC3372" to "/repo"
    Then the transfer is refused with "DEST_EXISTS"
    When I transfer it again, taking the next free name
    Then the transfer is done
    And "/repo/NGC3372/NGC3372_2024-06-15_FIT=3_2" holds the manifest

  @VIN-031 @VIN-028 @VIN-016
  Scenario: The ticked observations copy one after another, each into its target's folder
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2 and 3, frames 1 and 3 stacked
    And my scope holds "2024-06-16_22-10-00_observation_M42" with 2 FITS frames, both stacked
    When I scan the scope and copy every observation to "/repo"
    Then the copy reports:
      | 2024-06-16_22-10-00_observation_M42     | into M42/M42_2024-06-16_FIT=2.         |
      | 2024-06-15_21-00-54_observation_NGC3372 | into NGC3372/NGC3372_2024-06-15_FIT=3. |
    And "/repo/M42/M42_2024-06-16_FIT=2" holds the manifest
    And the copies were indexed once

  @VIN-027 @VIN-031
  Scenario: Too little room where copies land stops the copy before a byte is fetched
    Given my scope holds "2024-06-15_21-00-54_observation_NGC3372" with FITS frames 1, 2 and 3, frames 1 and 3 stacked
    And my scope holds "2024-06-16_22-10-00_observation_M42" with 2 FITS frames, both stacked
    And the disk where copies land has 10 bytes free
    When I scan the scope and copy every observation to "/repo"
    Then the copy reports:
      | 2024-06-16_22-10-00_observation_M42 | needs 31 B more room |
    And no file was fetched from the scope
    And nothing was indexed
