# 027 Hexagon hardening: requirements

Leigh asked for a stable base for features after the SyQon-inspired slices (specs 019 to 026):
the app should really be hexagonal, refactored where it is not, and the rules should hold without
anyone having to remember them.

An audit in October 2026 found the core clean. `packages/domain` and `packages/application`
import nothing they should not and do no I/O. The leaks were all in `src/main`:

- the IPC layer held policy: read-only folders, the work area and where a target's raw frames are;
- presenters held rules: whether a stack can be queued, the space verdict and a job's expected length;
- three adapters read the clock directly instead of taking the Clock port;
- adapters imported each other's helpers;
- composition read settings with its own SQL.

The architecture test only looked at import specifiers in two packages, so a side-effect import,
a `require`, a renderer reaching into the main process or a new legacy service would all have
passed.

## What this slice delivers

- **One architecture check for every layer.** `tests/architecture` reads the source with the
  TypeScript compiler, so it sees every import, including side-effect, dynamic and `require`
  imports. It checks the rules below for the domain, application, testkit, adapters, codecs,
  legacy services, the renderer and the shared types.
- **The core cannot reach the host.** Domain and application code that reads the clock or
  randomness, or uses a host global such as `process`, `console`, `setTimeout`, `fetch` or
  `navigator`, fails the check. Names are resolved by scope, so a parameter that happens to be
  called `process` is not a use of the global. ESLint gives the core no Node or browser globals, so editors flag the same thing as
  you type.
- **A ratchet on the legacy code.** `tests/architecture/legacy-ratchet.json` records three counts:
  - the `getSqlite()` calls;
  - the legacy service files;
  - the legacy service functions the IPC handlers call.

  A change that raises any count fails. A change that lowers one must lower the recorded number
  too, so the strangler only moves one way.
- **Adapters share helpers, not each other.** SQL fragments, the settings reader and the
  work-folder guard live in `src/main/adapters/shared/`. Adapters take a Clock instead of calling
  `new Date()`.

## Architecture

| ID | Pattern | Requirement |
|----|---------|-------------|
| HEX-001 | Ubiquitous | The domain and application packages shall take time, randomness and every host facility through a port and shall not use the clock, random numbers or a host global directly. |
| HEX-002 | Ubiquitous | The renderer shall reach the main process only through the preload bridge and the shared types, and shall not import main-process code, the core packages, Electron or Node built-ins. |
| HEX-003 | Ubiquitous | The shared types shall import nothing outside `src/shared`. |
| HEX-004 | Ubiquitous | A driven adapter shall not import a legacy service, the database connection, the IPC layer, the composition root or another adapter, other than the shared adapter helpers and, for presenters, other presenters. |
| HEX-005 | Ubiquitous | The system shall construct use cases only in the composition root. |
| HEX-006 | Ubiquitous | The testkit shall not import the desktop app. |
| HEX-007 | Ubiquitous | Legacy services and the file codecs shall not import adapters, the IPC layer or the composition root. |
| HEX-008 | Unwanted | If a change adds a `getSqlite()` call, a legacy service file or a legacy service call from the IPC handlers, then the architecture check shall fail and name the count that rose. |
| HEX-009 | Event | When a change lowers a legacy count, the architecture check shall fail until the recorded ratchet is lowered to match, so the count never rises again. |
| HEX-010 | Ubiquitous | Adapters other than the system clock shall read the time only through the Clock port. |
| HEX-011 | Unwanted | If a source file imports a module through a side-effect import, a dynamic import, `require` or a path alias, then the architecture check shall apply the same rules to it as to a relative static import, and shall refuse a specifier computed at run time that no rule can check. |
