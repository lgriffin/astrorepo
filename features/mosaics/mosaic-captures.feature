Feature: See where my captures landed on a mosaic
  I shoot a mosaic over many nights and the scope does not always land where I asked. I want each
  night's lights placed on the panel their plate solve puts them in, not by their folder name, and
  to be told when a capture sits between panels, has no solve yet, or I placed it somewhere odd.

  Background:
    Given a mosaic of 1 row by 2 columns at RA 12:00:00 Dec +00:00:00 for target "ngc4565"

  @MO-004 @MO-007
  Scenario: A night solved in the middle of the western panel is placed on it
    Given a night of 40 lights of "ngc4565" solved at the centre of R1C2
    When the captures are placed
    Then that night is on R1C2, accepted, drawn on the grid's projection

  @MO-005
  Scenario: A night between the two panels keeps both overlaps and asks for a look
    Given a night of 40 lights of "ngc4565" solved at the centre of the grid
    When the captures are placed
    Then that night overlaps R1C1 and R1C2 and is marked to review

  @MO-006
  Scenario: Lights with no plate solve are not placed on any panel
    Given a night of 40 lights of "ngc4565" not solved yet
    When the captures are placed
    Then no panel has that night and it is listed as not solved

  @MO-009
  Scenario: Putting a night by hand on a panel its field does not reach is kept but flagged
    Given a night of 40 lights of "ngc4565" solved on the western side of R1C2
    When I put that night on R1C1 by hand because "the scope log says so"
    Then that night counts toward R1C1 as a conflict, with its computed panel still R1C2

  @MO-010
  Scenario: Moving the grid lists the nights that would change panel before it is saved
    Given a night of 40 lights of "ngc4565" solved at the centre of R1C1
    When I move the grid one and a half panels east
    Then I am told that night would move from R1C1 to R1C2
    And revision 1 still places it on R1C1
