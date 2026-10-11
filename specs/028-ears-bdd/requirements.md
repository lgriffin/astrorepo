# 028 EARS traceability and BDD: requirements

Two things that keep the requirements honest. The EARS check (`npm run ears`) only counted a
requirement ID wherever it appeared in a test file, so an ID in a comment passed the gate. Now a
citation has to be the name of a test, and the report says how well each spec is covered. And the
main journeys are written as Gherkin features in Leigh's own words, run by vitest against the
application use cases and the in-memory testkit fakes.

## What this slice delivers

- **Citations a person can see.** An ID counts only in the title of an `it`, `test` or `describe`
  call (including `it.each` and friends) or as a tag on a Gherkin feature or scenario.
- **A coverage report.** Cited count per spec, and how many tests cite each requirement, on the
  console, as JSON with `npm run ears -- --json <path>`, and as a markdown table in the GitHub
  Actions job summary.
- **Failure paths for Unwanted requirements.** An "If ..., then ..." requirement must be cited by
  at least one test whose title names the failure, or by a Gherkin scenario.
- **Every slice has requirements.** Each `specs/NNN-*/` folder from 009 on must have a
  `requirements.md`.

## Traceability check

| ID | Pattern | Requirement |
|----|---------|-------------|
| TRC-001 | Ubiquitous | The traceability check shall count a requirement ID as cited only when it appears in square brackets in a test title (the first string argument of an it, test or describe call, chained forms included) or as a tag on a Gherkin feature, rule or scenario. |
| TRC-002 | Unwanted | If a requirement ID appears only in a comment, in a string that is not a test title, or in Gherkin step text, a comment or a doc string, then the traceability check shall not count it as cited. |
| TRC-003 | Ubiquitous | The traceability report shall state, for each spec, how many of its requirements are cited, and for each requirement how many tests cite it. |
| TRC-004 | Optional | Where a JSON report path is given, the traceability check shall write the report there in a machine-readable form. |
| TRC-005 | Optional | Where the GITHUB_STEP_SUMMARY environment variable is set, the traceability check shall append a markdown summary of the report to that file. |
| TRC-006 | Unwanted | If a spec folder numbered 009 or later has no requirements.md, then the traceability check shall fail and name the folder. |
| TRC-007 | Unwanted | If an Unwanted requirement is cited only by tests whose titles name no failure, and by no Gherkin scenario, then the traceability check shall fail and name the requirement. |
| TRC-008 | Ubiquitous | The traceability check shall read only table rows that have a requirement ID, a pattern and requirement text, and ignore every other table. |
