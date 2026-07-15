# Workflow State Machine

Every target in Astrorepo moves through a linear workflow that tracks its progress from initial planning through to a finished, archived image. The workflow has 12 stages reflecting the real astrophotography pipeline: planning and scheduling, data capture, calibration and stacking, post-processing, and output. Each transition is recorded in the `workflow_transitions` table with a timestamp and optional notes, providing a full audit trail of a target's journey. While the primary flow is linear, targets can be moved backward (e.g., re-observed after a failed integration) and the state machine allows any transition to support flexible real-world workflows.

```mermaid
stateDiagram-v2
    [*] --> planned

    planned : Planned
    planned : Target identified,<br/>research complete

    scheduled : Scheduled
    scheduled : On the imaging plan<br/>for a specific session

    observed : Observed
    observed : Data acquisition<br/>session completed

    raw_captured : Raw Captured
    raw_captured : Light, dark, flat,<br/>bias frames on disk

    calibrated : Calibrated
    calibrated : Frames calibrated<br/>(darks/flats applied)

    registered : Registered
    registered : Stars detected,<br/>frames aligned

    integrated : Integrated
    integrated : Frames stacked<br/>into master image

    processing : Processing
    processing : Stretch, denoise,<br/>colour balance

    edited : Edited
    edited : Final adjustments<br/>in image editor

    published : Published
    published : Shared online<br/>(Astrobin, etc.)

    printed : Printed
    printed : Physical print<br/>produced

    archived : Archived
    archived : Project complete,<br/>data backed up

    planned --> scheduled : Schedule for session
    scheduled --> observed : Session completed
    observed --> raw_captured : Files organized
    raw_captured --> calibrated : Calibration applied
    calibrated --> registered : Star alignment done
    registered --> integrated : Stacking complete
    integrated --> processing : Begin post-processing
    processing --> edited : Editing complete
    edited --> published : Share online
    published --> printed : Order / produce print
    printed --> archived : Archive project

    edited --> archived : Archive without print

    note right of planned
        Backward transitions are<br/>permitted for rework.<br/>All transitions are logged<br/>in workflow_transitions.
    end note
```
