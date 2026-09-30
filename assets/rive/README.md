# Published Rive runtime assets

Production `.riv` files consumed by Everest Local belong here.

Source RML projects belong in `design/rive/`, not in this directory.

Rules:

- Keep source and published asset names aligned.
- Commit a published `.riv` only after its source project passes Rive CLI verification/inspection.
- Do not put credentials or workspace metadata here.
- When a runtime asset changes its public view-model/state contract, update the corresponding application integration in the same PR.
