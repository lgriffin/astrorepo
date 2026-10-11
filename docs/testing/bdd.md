# Writing BDD features

The main journeys are written as Gherkin features in Leigh's own words and run by vitest, against
the application use cases and the in-memory fakes in `@astro/testkit`. No Electron, no SQLite:
a feature runs as fast as a unit test. The runner is in `packages/testkit/src/bdd` and its
behaviour is specified in [specs/028-ears-bdd](../../specs/028-ears-bdd/requirements.md).

## Layout

```text
features/
  support/words.ts                 shared parameter types and conversions
  <area>/<name>.feature            the scenarios
  <area>/<area>.steps.ts           step definitions and the World for the area
  <area>/<area>.test.ts            runs the area's features; vitest picks it up
```

`npm test` runs them with everything else. `npx vitest run features/jobs` runs one area.

## A feature

```gherkin
Feature: Stacks run in the night window, one at a time
  A sentence or two on why Leigh cares, in Leigh's own words.

  Background:
    Given the run window is 02:00 to 03:00, a job waits for 10 idle minutes and CPU under 30%

  @JOB-002
  Scenario: A stack queued in the afternoon waits for the window to open
    Given it is 14:00 on 30 September 2026
    And I queued a window stack of M 42 needing 1 GB
    When the job runner checks the queue
    Then nothing starts
    And the M 42 stack waits for the window, which opens at 02:00 on 1 October 2026
```

- **Tag every scenario with the EARS IDs it demonstrates** (`@JOB-002`). The runner writes them
  into the test title as `[JOB-002]` and `npm run ears` reads the tags from the `.feature` file,
  so a tagged scenario cites the requirement. Tag only what the scenario really shows. A
  scenario tag also satisfies the rule that an Unwanted ("If ..., then ...") requirement needs a
  failure test, so write the failure scenario when you tag one.
- A tag on the `Feature:` line cites its requirements for every scenario in it, but does not
  count as a failure test.
- `Background:` steps run before every scenario's own steps.
- `Scenario Outline:` with `Examples:` runs once per row; `<column>` is filled in the name, the
  steps, data tables and doc strings. Tags on an `Examples:` block apply to its rows.
- Data tables (`| a | b |`) and doc strings (`"""`) go to the step definition as its last argument.
- `And` and `But` take the keyword of the step before them. Step definitions ignore the keyword
  when matching, as in Cucumber, so `Given`, `When` and `Then` in a steps file are labels.

## Step definitions

```ts
import { expect } from 'vitest'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'
import { targetName } from '../support/words'

class JobRunner {
  readonly store = new InMemoryJobStore()
  // ...fakes and the use cases built over them
}

export const jobSteps = defineSteps(() => new JobRunner(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType(targetName)            // {target}: "M 42", "NGC 7000"

  Given('it is {time} on {int} {word} {int}', (w, time: string, day: number, month: string, year: number) => {
    w.clock.set(at(time, day, month, year).toISOString())
  })
  When('the job runner checks the queue', async w => { w.snapshot = await w.scheduler.tick() })
  Then('the {target} stack waits because of {string}', async (w, name: string, code: string) => {
    expect((await w.wait(name))?.code).toBe(code)
  })
})
```

```ts
// features/jobs/jobs.test.ts
import { runFeature } from '@astro/testkit/bdd'
import { jobSteps } from './jobs.steps'

runFeature(new URL('./run-window.feature', import.meta.url), jobSteps)
```

- Expressions are [Cucumber expressions](https://github.com/cucumber/cucumber-expressions):
  `{int}`, `{float}`, `{word}`, `{string}` (quoted, quotes removed) and `{}` (anything), plus
  your own with `defineParameterType({ name, regexp, transform })`. A `RegExp` works too.
- Each step gets the scenario's **World** first. `defineSteps` takes a factory and calls it for
  every scenario, so no state leaks between scenarios. Build the use cases over the testkit fakes
  in the World; never touch the file system, Electron or SQLite.
- Steps may be async; the runner awaits each in turn.
- Assert with vitest's `expect` in `Then` steps. Check what Leigh would see (the suggestion, the
  reason a job waits, the message a refusal gives), not internals.

## When a step is missing or wrong

- **Undefined step:** the scenario fails before any step runs, naming the step and its line and
  printing a definition to paste, for example
  `When('I stack {int} lights of {string} in it', (world, int, string) => { ... })`.
- **Ambiguous step:** the scenario fails before any step runs and lists every matching
  definition with the file and line it is in. Make one expression more specific.
- **Failing step:** the error starts with `Step failed at <file>:<line>: <step>`, lists the steps
  it skipped, then vitest's own assertion message and diff.
- **A .feature that does not parse:** the test file fails with the file, line and Gherkin's error.
