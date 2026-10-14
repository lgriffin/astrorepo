Feature: A gallery of my finished pictures
  I keep my finished PNGs in the images folder. I want to browse them like any gallery, and for
  each one see what the object is, named from the file, with links to explore my data on it.

  Background:
    Given the catalogue holds M31 "Andromeda Galaxy", a galaxy in Andromeda at 0.7122 h and +41.27°, magnitude 3.4, 178′ across
    And the catalogue holds M42 "Orion Nebula", an emission_nebula in Orion at 5.5908 h and -5.39°, magnitude 4, 85′ across
    And my site is at latitude 53.3°

  @GAL-001 @GAL-003
  Scenario: The gallery shows every picture, newest first, captioned with its object
    Given the images folder holds:
      | picture             | saved            |
      | M31.png             | 2026-10-01 20:00 |
      | M42/final.png       | 2026-10-03 20:00 |
      | Andromeda Galaxy.jpg| 2026-09-01 20:00 |
      | widefield.png       | 2026-10-02 20:00 |
    When I open the gallery
    Then the pictures are:
      | picture              | shows                  |
      | final.png            | M42 · Orion Nebula     |
      | widefield.png        |                        |
      | M31.png              | M31 · Andromeda Galaxy |
      | Andromeda Galaxy.jpg | M31 · Andromeda Galaxy |

  @GAL-002 @GAL-005 @GAL-007
  Scenario: Opening M31.png tells me what M31 is and when it is best placed
    Given the images folder holds "M31.png"
    When I open the gallery and pick "M31.png"
    Then the side panel shows "Andromeda Galaxy", read from the file name
    And it says "A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons across."
    And it is highest at midnight in September and climbs to 78° from my site

  @GAL-009 @GAL-010
  Scenario: A picture whose name names nothing the catalogue holds says so
    Given the images folder holds "NGC 891 test.png"
    When I open the gallery and pick "NGC 891 test.png"
    Then the side panel shows no object
    And it says "NGC 891" is not in the catalogue

  @GAL-011
  Scenario: The window cannot read a file outside the images folder
    Given the images folder holds "M31.png"
    When I open the gallery and the window asks for "C:/Users/leigh/secrets.png"
    Then the request is refused because "That picture is not in the images folder any more."
