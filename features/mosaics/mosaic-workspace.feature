Feature: Draw a mosaic on the sky and keep its revisions
  I plan big mosaics over several months. I want to draw the grid on the sky by its coordinates,
  name every panel, export the exact centres for the scope, and change the plan later without
  losing what the earlier plan was.

  @MO-001 @MO-012
  Scenario: A 3 by 4 mosaic of the North America nebula exports twelve panels with their coordinates
    Given a mosaic "Cygnus North America" centred at RA 20:59:17 Dec +44:31:44
    And its grid is 3 rows by 4 columns with 15% overlap and a 72 by 48 arcminute field
    When I save the mosaic
    Then it is saved as revision 1 with 12 panels from R1C1 to R3C4
    And the CSV export has 12 panels, each with its revision, ICRS centre and four corners

  @MO-002 @MO-010
  Scenario: Turning the grid saves revision 2 and keeps revision 1 as it was
    Given a mosaic "Cygnus North America" centred at RA 20:59:17 Dec +44:31:44
    And its grid is 3 rows by 4 columns with 15% overlap and a 72 by 48 arcminute field
    And I save the mosaic
    When I turn the grid to 30° and save it
    Then the mosaic has revisions 1 and 2
    And revision 1 still has its panels at 0°
    And saving the same grid again adds no revision

  @MO-003
  Scenario: A grid across RA 0° keeps every panel on the sky
    Given a mosaic "Andromeda to Pisces" centred at RA 23:59:30 Dec +30:00:00
    And its grid is 1 rows by 4 columns with 15% overlap and a 72 by 48 arcminute field
    When I save the mosaic
    Then its panels sit either side of RA 0° with their RA between 0° and 360°

  @MO-015
  Scenario: A grid with no rows is refused with the reason
    Given a mosaic "Broken" centred at RA 05:35:17 Dec -05:23:28
    And its grid is 0 rows by 2 columns with 15% overlap and a 72 by 48 arcminute field
    When I save the mosaic
    Then it is refused because "Rows must be a whole number from 1 to 12."
