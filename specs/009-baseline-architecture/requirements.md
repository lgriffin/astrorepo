# 009 Baseline architecture: requirements

Requirements use EARS (Easy Approach to Requirements Syntax). Each row has an ID, the EARS
pattern it follows, and the requirement text. `npm run ears` fails when:

- a requirement ID is not cited by any test (write the ID in square brackets in the test name,
  for example `it('[DSC-010] Given ..., When ..., Then ...')`),
- a test cites an ID that no `specs/*/requirements.md` defines,
- an ID is defined twice, or
- the text does not read as its pattern.

| Pattern | Shape |
|---|---|
| Ubiquitous | The system shall ... |
| Event | When <trigger>, the system shall ... |
| State | While <state>, the system shall ... |
| Unwanted | If <unwanted condition>, then the system shall ... |
| Optional | Where <feature is present>, the system shall ... |
| Complex | Two or more of the above, for example While ..., when ..., the system shall ... |

IDs keep the prefixes from the cockpit blueprint (DSC discovery, NFR quality, and so on). A
requirement moves into a spec's `requirements.md` when a slice starts building it, so the
gate only ever asks for tests of work in progress or done.

## Architecture

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-004 | Ubiquitous | The domain and application packages shall not import any adapter, framework, Node built-in or I/O module. |
| NFR-005 | Ubiquitous | The build shall fail when a requirement ID is not cited by at least one automated test, or when a test cites an undefined ID. |
| NFR-006 | Ubiquitous | Every adapter of a port shall pass that port's contract suite. |
| NFR-007 | Unwanted | If a requirement's wording does not match its declared EARS pattern, then the traceability check shall fail. |

## Discovery: stacking suggestions (walking skeleton)

| ID | Pattern | Requirement |
|----|---------|-------------|
| DSC-010 | Complex | While a target has at least the ready-to-stack threshold (default 2 hours) of light integration and no stacked image, when the user opens the dashboard, the system shall suggest stacking it, stating the integration, the number of subs and the number of nights. |
| DSC-004 | Event | When a target's subs captured after its newest stack add up to at least the restack threshold (default 1 hour), the system shall suggest a restack that states the integration added since that stack. |
| DSC-011 | Ubiquitous | The system shall order stacking suggestions by unprocessed integration, largest first. |
| DSC-012 | Ubiquitous | The system shall assign each frame to the observing night that began on the evening before it, so that a session crossing midnight counts as one night. |
| DSC-013 | Ubiquitous | The system shall date a stacked image by when its file was written, not by the DATE-OBS it inherits from its first sub. |
