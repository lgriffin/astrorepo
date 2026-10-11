Feature: My files stay where they are, and copies are found
  My Seestar subs live on the NAS, and over the years I've copied folders into backups more
  than once. I want the app to find the duplicate copies and tell me what they cost, without
  ever touching my source folders, and to lay out a target for Siril in its own work area.

  Background:
    Given the NAS holds these subs:
      | path                                     | content                         |
      | /nas/seestar/M 81_sub/Light_001.fit      | HEAD-m81-001-PIXELS-TAIL        |
      | /nas/old-backup/2024/m81/Light_001.fit   | HEAD-m81-001-PIXELS-TAIL        |
      | /nas/seestar/M 81_sub/Light_002.fit      | HEAD-m81-002-PIXELS-TAIL        |
      | /nas/seestar/M 42_sub/Light_001.fit      | HEAD-m42-001-PIXELS-TAIL-longer |

  @ING-003 @ING-001
  Scenario: A sub copied into an old backup is one duplicate group, and nothing is deleted
    When I check for duplicates
    Then there is 1 duplicate group of 24 bytes listing:
      | /nas/old-backup/2024/m81/Light_001.fit |
      | /nas/seestar/M 81_sub/Light_001.fit    |
    And 24 bytes could be reclaimed
    And every file on the NAS is unchanged

  @ING-012
  Scenario: Same-size subs are told apart by their sampled ends before anything is read in full
    When I check for duplicates
    Then 4 files were sampled and 2 read in full
    And only these files were read in full:
      | /nas/old-backup/2024/m81/Light_001.fit |
      | /nas/seestar/M 81_sub/Light_001.fit    |

  @ING-008
  Scenario: Checking again with nothing changed reads no file at all
    Given I have checked for duplicates once
    When I check for duplicates
    Then no file was read
    And 4 stored hashes were reused

  @ING-008
  Scenario: Only the sub I edited is read again, and a deleted backup is forgotten
    Given I have checked for duplicates once
    And "/nas/seestar/M 81_sub/Light_002.fit" was edited on "2026-03-05T09:00:00.000Z" to "HEAD-m81-002-EDITED-TAIL"
    And "/nas/old-backup/2024/m81/Light_001.fit" was deleted
    When I check for duplicates
    Then only "/nas/seestar/M 81_sub/Light_002.fit" was sampled
    And there are no duplicate groups
    And no stored hash remains for "/nas/old-backup/2024/m81/Light_001.fit"

  @ING-003
  Scenario: A sub the NAS cannot read is skipped and the rest of the check stands
    Given the NAS cannot read "/nas/seestar/M 42_sub/Light_001.fit"
    When I check for duplicates
    Then 1 file is counted as unreadable
    And there is 1 duplicate group of 24 bytes listing:
      | /nas/old-backup/2024/m81/Light_001.fit |
      | /nas/seestar/M 81_sub/Light_001.fit    |

  @DSC-015
  Scenario: The cockpit's hidden card shows unreadable files and stored duplicates without reading anything
    Given I have checked for duplicates once
    And the last scan quarantined "/nas/seestar/M 81_sub/bad.fit" because "SIMPLE != T"
    When I open the hidden in your files card
    Then it shows 1 unreadable file
    And it shows 1 duplicate file in 1 group, 24 bytes reclaimable
    And no file was read
