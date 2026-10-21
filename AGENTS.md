# CortexOS contributor instructions

Read `development.md`, `docs/development-standards.md` and `docs/implementation-plan.md` before implementing a milestone. Actual completion and commands belong in `docs/milestone-log.md`.

- Deliver the current phase as a working, verified slice. Stop at its documented acceptance gate.
- Run commands from this independent repository; confirm `git rev-parse --show-toplevel` before staging or pushing.
- Use the repository's configured credential manager for normal pushes. Keep `Gittoken.txt` ignored and out of output, commits and URLs.
- Use npm in `apps/desktop`, commit its lockfile and Cargo.lock. `rust-toolchain.toml` selects MSVC for this project without changing the user's global default.
- Keep UI content honest: label placeholders, retain errors and drafts, and record only actual execution events.
- Build task-oriented layouts with lists, forms, timelines and a focused canvas; use the existing semantic CSS tokens.
- Add privileged Tauri capabilities only for an implemented, documented need. Frontend code does not read files, databases or model services directly.
- Record commands actually executed and distinguish browser checks, native WebView2 checks and unverified manual checks.
- UI changes follow the permanent V3 standard in `docs/design/ui-direction-v3.md`: original AI Chat reference, global shared tokens and controls, interruptible graph camera controls and actual screenshot verification. V3 is the default for chat, knowledge, graph, settings and their editors/dialogs.
