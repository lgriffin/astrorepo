Feature: The Messier mosaic shows my own pictures and the gaps I can fill
  A big part of what this app is meant to do is a mosaic of the Messier objects, with my own image
  file embedded in each tile. I want to press a button to see it, and it should tie into planning,
  so I can see which objects I still have gaps for and when I can shoot them.

  Background:
    Given my site is London
    And it is 15:00 UTC on 29 September 2026
    And the Messier catalogue holds:
      | number | name                   | type             | RA hours | Dec    |
      | 1      | Crab Nebula            | supernova_remnant| 5.58     | 22.01  |
      | 13     | Great Hercules Cluster | globular_cluster | 16.69    | 36.46  |
      | 29     | Cooling Tower          | open_cluster     | 20.4     | 38.52  |
      | 31     | Andromeda Galaxy       | galaxy           | 0.71     | 41.27  |
      | 83     | Southern Pinwheel      | galaxy           | 13.62    | -29.87 |
      | 87     | Virgo A                | galaxy           | 12.51    | 12.39  |

  @MES-001 @MES-002 @MES-003
  Scenario: Each tile shows my own picture and how far the object has come
    Given M 31 has a finished JPEG "m31_final.jpg" and a colour master "m31_master.fit"
    And M 13 has 2 hours of lights and a mono master "m13_master.fit"
    And M 1 has 30 minutes of lights
    When I open the Messier mosaic
    Then the tiles run M 1, M 13, M 29, M 31, M 83, M 87
    And M 31 is imaged and shows "m31_final.jpg"
    And M 13 is stacked and shows "m13_master.fit"
    And M 1 is captured with no picture
    And M 87 is not captured
    And the counts are 1 imaged, 1 stacked, 1 captured and 3 not captured of 110

  @MES-003
  Scenario: A finished picture keeps its own colours and a master is stretched
    Given M 31 has a finished JPEG "m31_final.jpg" and a colour master "m31_master.fit"
    And M 13 has 2 hours of lights and a mono master "m13_master.fit"
    When the pictures of M 31 and M 13 are drawn
    Then "m31_final.jpg" is drawn as it is
    And "m13_master.fit" is drawn stretched

  @MES-004
  Scenario: When a picture cannot be drawn, the tile falls back to the next one
    Given M 31 has a finished JPEG "m31_final.jpg" and a colour master "m31_master.fit"
    And "m31_final.jpg" cannot be decoded
    When the picture of M 31 is drawn
    Then the tile shows "m31_master.fit"

  @MES-005
  Scenario: Each missing object says when I can shoot it from my site
    When I open the Messier mosaic
    Then M 29 is up tonight
    And M 13 is up tonight with its season closing within 30 days
    And M 87 is in season from a later month
    And M 83 is never high enough from my site

  @MES-005
  Scenario: A bright moon holds back the galaxies tonight
    Given tonight the moon is up and 95% lit
    And I have no dual-band or narrowband filter
    When I open the Messier mosaic
    Then M 31 is held back by the moon tonight

  @MES-010
  Scenario: Without a site the mosaic still shows my pictures and states
    Given no observing site is set
    And M 31 has a finished JPEG "m31_final.jpg" and a colour master "m31_master.fit"
    When I open the Messier mosaic
    Then M 31 is imaged and shows "m31_final.jpg"
    And no tile says when it is up

  @MES-008
  Scenario: Home's next actions name the Messier gaps I can shoot tonight, closing seasons first
    Given M 31 has 30 minutes of lights
    When Home works out the next actions
    Then the next actions name the Messier gaps M 13, M 29 and M 1
    And no captured object is named as a Messier gap

  @MES-011
  Scenario: The window cannot ask for a picture outside the catalogue
    When the window asks for the picture of Messier 111
    Then it is refused and no file is read
