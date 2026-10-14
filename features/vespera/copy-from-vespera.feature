Feature: Copying observations off the Vespera
  After a night with the Vespera I join the PC to its Wi-Fi and want the night's frames in my
  library without opening an FTP client: see what the scope holds, tick what is new, and have it
  land in each target's raw folder where the cockpit finds it. Nothing on the scope should be
  touched, and nothing I already have should be overwritten.

  Background:
    Given the Vespera at 10.0.0.1 holds "2024-03-10_21-33-02_M 42" with 2 FITS frames, a JPEG preview and its JSON
    And it holds "Andromeda" with 1 FITS frame
    And copies land in "/nas/home/raw"

  @VSP-001 @VSP-015
  Scenario: Looking at the scope shows each observation and what is new
    When I look for observations
    Then the observations are:
      | folder                   | target    | taken               | files | new | state |
      | 2024-03-10_21-33-02_M 42 | M 42      | 2024-03-10T21:33:02 | 3     | 3   | new   |
      | Andromeda                | Andromeda |                     | 1     | 1   | new   |

  @VSP-003 @VSP-008 @VSP-005
  Scenario: Copying M 42 lands its frames under its target and hands them on to be indexed
    When I copy "2024-03-10_21-33-02_M 42"
    Then "/nas/home/raw/M 42/2024-03-10_21-33-02_M 42" holds:
      | 01-images-initial/img-0001.fits |
      | 01-images-initial/img-0002.fits |
      | observation.json                |
    And the copies were handed on to be indexed in "/nas/home/raw"
    And the scope was only listed and read

  @VSP-004 @VSP-007
  Scenario: A copy cut off by the Wi-Fi carries on from where it stopped
    Given the Wi-Fi drops while the second frame of M 42 is copying
    When I copy "2024-03-10_21-33-02_M 42"
    Then the copy failed after 1 file, saying "The connection to the scope was lost."
    And no partial file is left in "/nas/home/raw"
    When the Wi-Fi is back and I copy "2024-03-10_21-33-02_M 42" again
    Then the copy is done with 2 files copied and 1 skipped as already on the PC

  @VSP-006
  Scenario: A file I already changed on the PC is never overwritten
    Given "/nas/home/raw/M 42/2024-03-10_21-33-02_M 42/observation.json" already holds my own edits
    When I copy "2024-03-10_21-33-02_M 42"
    Then "/nas/home/raw/M 42/2024-03-10_21-33-02_M 42/observation.json" still holds my own edits
    When I look for observations
    Then "2024-03-10_21-33-02_M 42" says 1 file on the PC has another size

  @VSP-010
  Scenario: A copy that would not fit copies nothing
    Given the landing disk has 10 bytes free, and the 87 bytes to copy need 88 with the margin
    When I copy "2024-03-10_21-33-02_M 42"
    Then the copy failed for lack of room, short by 78 bytes
    And no partial file is left in "/nas/home/raw"

  @VSP-002
  Scenario: The PC is not on the Vespera's Wi-Fi
    Given the scope is not reachable
    When I look for observations
    Then I am told "Nothing answered at 10.0.0.1:21."
