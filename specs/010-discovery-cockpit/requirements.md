# 010 Discovery cockpit: requirements

Slice C, first part, of the cockpit blueprint: what is hiding in the FITS files, and how far each
target has got, worked out from the data. It builds on the walking skeleton in
`specs/009-baseline-architecture` and uses the same EARS gate (`npm run ears`).

## What this slice delivers

- A "Hidden in your files" card on the dashboard: nights never stacked, subs with no target,
  calibration frames that match no lights, and subs rejected by quality checks.
- A progress strip that counts targets as planned, capturing, enough data, stacked, processed or
  final, derived from their files instead of the manual workflow stage.
- A "What the files say" panel on each target: integration by filter, scope and night, last
  capture, stacks and the nights not yet in one.
- Dismissing a stacking suggestion hides it until that target's data changes.
- One migration source for the app and the tests.

## Changes to the blueprint's wording

- **DSC-001** said "when indexing of a source completes". Discovery is computed when it is looked
  at, which gives the same answer without a background step, so the trigger is opening the
  cockpit or a target.
- **DSC-006** listed duplicate bytes as hidden data. Duplicates need content hashes, which the
  ingest slice adds (`specs/011-ingest-core`), so duplicates are covered there.
- **DSC-014** and **NFR-008** are new. DSC-014 records a matching rule the code needed: many
  Seestar and DSLR headers leave out gain or temperature, and a missing value must not make a
  good dark look useless. NFR-008 is the blueprint's "one migration source" from slice I, done
  now because every new table would otherwise need writing twice.

## Discovery

| ID | Pattern | Requirement |
|----|---------|-------------|
| DSC-001 | Event | When the user opens the cockpit or a target, the system shall show for each target its integration by filter, scope and night, its last capture date, its stacks and the nights not yet in a stack, and whether processed or final images exist. |
| DSC-006 | Ubiquitous | The system shall surface hidden data: nights of subs never stacked, subs with no resolved target, calibration frames with no matching lights, and frames rejected by quality metrics. |
| DSC-008 | Event | When the user dismisses a suggestion, the system shall hide it until that target's data changes. |
| DSC-009 | Ubiquitous | The system shall derive each target's progress state (planned, capturing, enough data, stacked, processed, final) from its data rather than from manual entry. |
| DSC-014 | Unwanted | If a calibration frame or a light frame omits gain, sensor temperature, exposure or filter from its header, then the system shall not treat the missing value as a mismatch when matching calibration to lights. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-008 | Ubiquitous | The desktop app and the test suite shall build the database schema from one migration source. |
