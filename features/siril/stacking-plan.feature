Feature: Planning a Siril stack before I commit disk and memory to it
  Before I start a stack I want to know which of Siril's stock scripts fits my frames, how much
  disk it will chew through with every intermediate kept, whether my PC has the memory for it,
  and that the lights grading threw out stay out. Making the plan must not write anything.

  @RCP-001
  Scenario: Seestar lights with darks, flats and biases get the full colour script
    Given "/data/M 31" holds 20 colour lights of 1920 by 1080 pixels with 5 darks, 5 flats and 5 biases
    When I plan the stack into "/work/M 31"
    Then the plan counts 20 lights, 5 darks, 5 flats and 5 biases
    And it recommends "OSC_Preprocessing"

  @RCP-003
  Scenario: A small work disk is short, and leftovers from an earlier run are not counted on
    Given "/data/M 31" holds 100 colour lights of 1000 by 1000 pixels
    And the work disk has 1.0 GB free and an earlier run left 0.5 GB in the work folder
    When I plan the stack into "/work/M 31"
    Then "OSC_Preprocessing_WithoutDBF" needs 2.612 GB and is short by 1.612 GB
    And the plan reports 0.5 GB left by the earlier run

  @RCP-005
  Scenario: Mono lights with only darks get no recommendation, and the mono script says what is missing
    Given "/data/M 31" holds 10 mono lights of 1000 by 1000 pixels with 3 darks, 0 flats and 0 biases
    When I plan the stack into "/work/M 31"
    Then no script is recommended
    And "Mono_Preprocessing" is missing biases and flats

  @RCP-004
  Scenario: Lights the index never sized are estimated from their file size and marked approximate
    Given "/data/M 31" holds 3 lights the index has not read
    When I plan the stack into "/work/M 31"
    Then the plan's frame size is approximate
    And the lights are taken as colour without that being known

  @NFR-010
  Scenario: Making the plan writes nothing
    Given "/data/M 31" holds 5 colour lights of 1000 by 1000 pixels with 2 darks, 0 flats and 0 biases
    When I plan the stack into "/work/M 31"
    Then no frame was placed and no folder was made

  @ADV-001
  Scenario: A PC with plenty of free memory stacks 300 Seestar lights in one pass
    Given "/data/M 31" holds 300 colour lights of 1080 by 1920 pixels
    And my PC has 64 GB of memory with 32 GB free
    When I plan the stack into "/work/M 31"
    Then the recommended script's memory check says "one-pass"

  @ADV-002
  Scenario Outline: With <free> GB free of <total> GB, Siril <verdict>
    Given "/data/M 31" holds 300 colour lights of 1080 by 1920 pixels
    And my PC has <total> GB of memory with <free> GB free
    When I plan the stack into "/work/M 31"
    Then the recommended script's memory check says "<fit>"
    And its advice mentions "<advice>"

    Examples:
      | total | free | fit    | verdict                         | advice                       |
      | 32    | 2    | blocks | stacks in slower blocks         | stack in blocks              |
      | 16    | 0.1  | short  | is short until programs close   | Close other programs         |
      | 0.5   | 0.1  | short  | needs fewer lights at a time    | Stack fewer lights at a time |

  @GRD-003 @GRD-007
  Scenario: A trailed sub that fails the eccentricity limit is rejected and left out of the plan
    Given "/data/M 42" holds lights Light_001.fit, Light_002.fit and Light_003.fit from one night, and a dark
    And Light_002.fit measures an eccentricity of 0.9
    When the lights are graded
    Then Light_002.fit is rejected for its eccentricity
    When I plan the stack into "/work/M 42"
    Then the plan counts 2 lights and says 1 was rejected by grading

  @GRD-007
  Scenario: A light rejected after an earlier prep is taken back out of the work area
    Given "/data/M 42" holds lights Light_001.fit, Light_002.fit and Light_003.fit from one night, and a dark
    And Light_002.fit measures an eccentricity of 0.9
    And I prepped "/data/M 42" for Siril in "/work/M 42" before grading
    When the lights are graded
    And I prep "/data/M 42" for Siril in "/work/M 42" again
    Then "/work/M 42/lights/Light_002.fit" was removed from the work area
    And "/data/M 42" is unchanged

  @GRD-011
  Scenario: A light that cannot be measured stays in the stack, marked as not measured
    Given "/data/M 42" holds lights Light_001.fit, Light_002.fit and Light_003.fit from one night, and a dark
    And Light_003.fit cannot be measured because "The pixel data is truncated."
    When the lights are graded
    Then Light_003.fit is shown as not measured: "Not measured: The pixel data is truncated."
    When I plan the stack into "/work/M 42"
    Then the plan counts 3 lights and says 0 was rejected by grading
