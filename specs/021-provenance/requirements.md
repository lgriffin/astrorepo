# 021 Provenance: requirements

This is slice P1, the third of the SyQon-inspired slices (see the roadmap). SyQon Studio keeps a
project file per master and never leaves half a master behind. Astrorepo hands stacking to
Siril's stock scripts and builds the same habits around them:
- every published stack has a manifest saying what made it;
- a stack is published only when every step succeeded;
- a long stack carries on from the step where it stopped;
- each target keeps a timeline of its runs;
- the Siril failures that come up again and again are explained.

## What this slice delivers

- **Step by step.** A queued stack runs Siril's stock script one step at a time. Each step is
  its own Siril run from the work folder, and the job shows which step it is on.
- **Carry on.** When the app closes during a stack, the next start carries on from the step it
  stopped at, provided the script and the frames laid out for it are unchanged. Otherwise it
  starts again from the first step.
- **Publish only on success.** When every step succeeded, each result Siril wrote gets a
  manifest beside it (`result_3600s.fit.astrorepo.json`). The manifest records:
  - the script;
  - each step and how long it took;
  - every frame by folder, with its source;
  - the lights grading left out.

  When a step fails or the stack is cancelled, whatever result it wrote is moved to the work
  folder's `failed/<job>` folder. It is never taken for a finished stack.
- **Known failures explained.** When a stack fails with a message the app knows, the job's note
  and log say what it usually means and what to do. Known messages include a full disk, too
  little memory, a Siril too old for the script, too few stars to register, frames of different
  sizes, mono frames in a colour script, an empty folder, and a file another program holds open.
- **A timeline per target.** Step **4 · Runs** on a target's Stack and process lists its runs.
  Each shows how far it got, whether it carried on from an earlier run, and what it published.

## Changes to the blueprint

- **Steps from the stock script, not a script of our own.** The app splits the script Siril
  ships into steps. A step ends on a command that saves its work to files: `convert`,
  `calibrate`, `register`, `stack` and the sequence extractions. Commands that work on the image
  Siril holds in memory, such as `load`, `mirrorx` and `save`, stay in the step before them.
  Session settings (`requires`, `set…`) are repeated in every step. A script that leaves the
  work folder or names an absolute path is not split; it runs whole, as before.
- **Carrying on is keyed, not guessed.** The app does not trust files left in `process/`.
  Progress is saved after each step with a key made from the script's text and every frame laid
  out. A changed grade, a new frame or another Siril version gives a new key and a fresh start.
- **Post-processing is not staged.** Siril_Scripts v2 writes its own outputs beside the stack,
  so its runs get failure explanations but no staging or manifest.

## Running a stack

| ID | Pattern | Requirement |
|----|---------|-------------|
| PRV-001 | Event | When every step of a stack has succeeded, the system shall write beside each result it wrote a manifest naming the target, the script, each step and how long it took, every frame in its input folders by folder with its source (none for a frame the app did not place there), and the lights grading left out. |
| PRV-002 | Unwanted | If a step of a stack fails, the stack is cancelled (before or during a step, or before its result is published), or its result cannot be published with its manifest, then the system shall move any result the run wrote, with any manifest beside it, into the work folder's failed folder, publish nothing, and start no further step. |
| PRV-003 | Ubiquitous | The system shall run a stock Siril script one step at a time, each step a separate Siril run from the work folder that ends on a command that saves its work, show the step running, and run a script it cannot split whole. |
| PRV-004 | Event | When a stack stopped by the app closing starts again with the same script and frames, the system shall carry on from the step it stopped at and say so in its log and manifest, treating only results that were not in the work folder when the run first started as its own. |
| PRV-005 | Unwanted | If the script, the frames laid out for a stack, or any frame in its input folders (by name, size or modified time) changed since it stopped, then the system shall set aside what the stopped attempt wrote and start it again from the first step. |
| PRV-006 | Unwanted | If a job fails with a Siril message the system knows, then the system shall add to its note and log what the message usually means and what to do. |
| PRV-007 | Ubiquitous | The system shall list each target's runs on its Stack and process page with how far each got, whether it carried on from an earlier run, and the results it published. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-015 | Ubiquitous | The system shall write step scripts, manifests and set-aside results only inside the stack's work folder. |
