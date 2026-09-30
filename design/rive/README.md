# Everest Local — Rive source workflow

This directory is the source-of-truth area for Rive CLI / RML projects used by Everest Local.

## Why this exists

Rive's CLI and RML let coding agents author, inspect, verify, diff, and version interactive Rive graphics alongside the application code. The visual Editor remains useful for manual refinement, but the normal engineering workflow should not require manually moving prompts or files between tools.

## Project layout

Each production animation should live in its own project directory under `design/rive/`:

```
design/rive/
  everest-live-search/
    rive.yaml
    scene.rml
    AGENTS.md
    ...assets/scripts/shaders generated for the project
```

Published runtime assets belong in:

```
assets/rive/
  *.riv
```

Do not commit Rive account credentials, cookies, access tokens, or CLI auth state.

## Agent workflow

For a new animation:

1. Install the current Rive CLI.
2. Run `rive docs` and `rive schema` before authoring RML; the CLI docs are authoritative for the installed version.
3. Scaffold with `rive create <project-name>` inside this directory.
4. Author/refine RML and related assets.
5. Verify with `rive <project-dir> --verify`.
6. Inspect with `rive inspect <project-dir> --summary`.
7. Keep the interaction contract stable: app-visible state should be driven through Rive view-model/data-binding properties where possible.
8. Open/push to the Rive Editor only when visual refinement or publishing is needed.

The CI workflow `.github/workflows/rive-rml.yml` installs the current Rive CLI and verifies every Rive project in this directory without requiring a Rive account.

## Workspace authentication

Creating, verifying, inspecting, and previewing projects can be done without signing in.

When a project needs to be linked to the **Everest Local** Rive workspace, authenticate interactively with:

```bash
rive login
```

Then use the current CLI's documented push/pull/publish flow. Authentication must happen in a trusted interactive environment; never place login state in this repository.

## Runtime integration

Do not add a Rive runtime dependency simply because this directory exists. Add the appropriate official Rive runtime only when the first production `.riv` asset is ready to be integrated, so native dependency changes stay intentional and testable.

For Everest Local, the expected mobile runtime target is React Native/Expo. Web projects can use the official web/React runtime.

## Quality rules

- Motion must communicate state or hierarchy, not act as decoration-only noise.
- Respect reduced-motion/accessibility paths in the host app.
- Never block a critical action on a long animation.
- Keep state names semantic and stable.
- Prefer one reusable state-driven asset over many near-duplicate files.
- Test on low-end Android as well as current iPhone hardware before shipping.
