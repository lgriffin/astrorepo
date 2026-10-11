# 029 Property and fuzz testing: requirements

Example tests show that a rule does what its author pictured. This slice adds two kinds of test
that look for what the author did not picture: property tests, which state an invariant of a
domain rule (a partition, a range, a round trip, an ordering) and check it against hundreds of
generated inputs on every run, and fuzz tests, which feed every parser of untrusted input (tool
output, solver results, pasted lines, saved settings, FITS, PNG and camera RAW bytes) random and
mutated input and check that it fails only the way it is documented to.

## What this slice delivers

- Property tests for the domain in `packages/domain/test/properties/`, run by `npm test`.
- Fuzz tests in `tests/fuzz/`, run by `npm test` with a small number of runs and by
  `npm run test:fuzz` with many more; a nightly workflow runs the long version and keeps the seed
  of any failure.
- A corpus of the inputs that found bugs, replayed on every run.
- Fixes for the crashes, hangs and malformed results the tests found.

## Decisions

- **fast-check.** It shrinks a failure to a small input and prints the seed and path that replay
  it, which is what a regression corpus needs. It is a dev dependency only.
- **Structure-aware seeds.** Random bytes rarely get past a magic number, so the binary readers are
  also fuzzed with byte mutations of valid files built by the test helpers.
- **One FITS card parser.** The scanner and the image reader each read header cards their own way
  and disagreed (the image reader read `1.5D2`; the scanner kept it as text). The image reader now
  uses the scanner's card parser, which reads FITS's `D` exponent.

## Robustness

| ID | Pattern | Requirement |
|----|---------|-------------|
| FUZ-001 | Unwanted | If a text parser (a tool's output, a solver's result, a Siril script or log, a pasted comet line, a stack manifest or a saved setting) receives malformed input, then the system shall return its documented empty result, default or typed failure without throwing an unexpected error. |
| FUZ-002 | Unwanted | If a binary reader (a FITS header or image, a PNG image or a camera RAW file's TIFF tags) receives malformed or truncated bytes, then the system shall refuse the file with its documented error, without throwing any other error and without allocating memory for pixels the file does not hold. |
| FUZ-003 | Ubiquitous | The system shall finish parsing any input in bounded time, so that a malformed file or line never hangs a scan, a job or the app. |
| FUZ-004 | Ubiquitous | The system shall return from a parser only well-formed values: finite numbers within their documented ranges, and no value taken from an object's prototype. |
| FUZ-005 | Ubiquitous | The system shall read a FITS header card the same way wherever it reads one, so that the scanner and the image reader never disagree on a card's value. |

## Invariants

| ID | Pattern | Requirement |
|----|---------|-------------|
| FUZ-006 | Ubiquitous | The system's domain rules shall hold their stated invariants (partitions, ranges, round trips, monotonic estimates and stable orderings) for every input the property tests generate. |

## Reproducing failures

| ID | Pattern | Requirement |
|----|---------|-------------|
| FUZ-007 | Event | When a property or fuzz test fails, the test suite shall report the seed and path that replay it, and the input that failed shall be kept in the fuzz corpus and replayed on every run. |
| FUZ-008 | Ubiquitous | The project shall run the fuzz tests every night with at least 20,000 runs per target and keep the log and seed of any failure. |
