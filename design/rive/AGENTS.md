# Rive agent instructions for Everest Local

These instructions apply to every Rive project under this directory.

## Before editing

- Read the installed CLI's own guidance with `rive docs`.
- Use `rive schema` for supported RML types/properties. Do not guess undocumented RML syntax.
- Inspect an existing project before changing its public state/data contract.
- Treat the current Rive CLI as a technical-preview tool: verify output rather than assuming Editor/CLI parity.

## Required validation

For each changed Rive project directory:

```bash
rive <project-dir> --verify
rive inspect <project-dir> --summary
```

Both commands must succeed before the change is considered ready.

## Integration contract

Use semantic view-model/data properties for app-driven state. Example concepts:

- `status`: idle / searching / matched / accepted / success / error
- `progress`: numeric progress where meaningful
- `providerCount`: nearby provider count
- `reducedMotion`: host accessibility preference

Do not bake business logic, network calls, secrets, pricing authority, or payment decisions into Rive. Rive is a presentation/interaction layer; the React Native application and backend remain authoritative.

## Performance

- Avoid unnecessary high-cost effects.
- Reuse components and assets where practical.
- Keep raster assets appropriately sized.
- Prefer deterministic state transitions.
- Do not create indefinite high-frequency animation when the UI is backgrounded.
