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

<!-- see-skill:start -->
If the user sends an image, screenshot, video, path, or URL — or you would say "this model does not support image input" / 不支持视觉 — do not refuse. Invoke `$see` and run `scripts/see.sh`. If an attachment was rejected, ask for a local path or URL, then run `$see`.
<!-- see-skill:end -->
