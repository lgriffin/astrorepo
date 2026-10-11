Feature: Prep for Siril works in its own area
  "Prep for Siril" used to rename files in my target folder. Now it builds lights, darks, flats
  and biases folders in the app's work area, from hard links where the disk allows and copies
  otherwise, and it refuses outright to work anywhere inside my data.

  Background:
    Given my Seestar folder "/data/M 81" holds:
      | name          | type        |
      | Light_001.fit |             |
      | Light_002.fit |             |
      | d1.fit        | Dark Frame  |
      | Flat_1.fit    | Flat Field  |

  @ING-013
  Scenario: Each frame lands in its Siril folder as a hard link
    When I prep "/data/M 81" for Siril in "/work/siril/M 81"
    Then the work area has 2 lights, 1 darks, 1 flats and 0 biases
    And 4 frames were linked and 0 copied
    And "/work/siril/M 81/darks/d1.fit" comes from "/data/M 81/d1.fit"

  @ING-001
  Scenario: My source folder is only read
    When I prep "/data/M 81" for Siril in "/work/siril/M 81"
    Then "/data/M 81" lists exactly what it did before
    And every file written is under "/work/siril/M 81/"

  @ING-001
  Scenario Outline: A work area that overlaps my data is refused before anything is written
    When I try to prep "/data/M 81" for Siril in "<work area>" with "/nas/library" also indexed
    Then the prep is refused because it overlaps "<overlaps>"
    And nothing was written to any work area

    Examples:
      | work area         | overlaps     |
      | /data/M 81/siril  | /data/M 81   |
      | /data             | /data/M 81   |
      | /nas/library/work | /nas/library |

  @ING-013
  Scenario: Frames on the NAS are copied once, and a second prep leaves them be
    Given "/data/M 81/Light_001.fit" is on another disk from the work area
    When I prep "/data/M 81" for Siril in "/work/siril/M 81"
    Then 3 frames were linked and 1 copied
    When I prep "/data/M 81" for Siril in "/work/siril/M 81"
    Then 4 frames were already in place
