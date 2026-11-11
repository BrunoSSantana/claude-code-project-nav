# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See [docs/RELEASING.md](docs/RELEASING.md) for how versions are chosen and released.

## [Unreleased]

## [0.4.1] - 2026-11-11

### Changed

- Pinned projects now sit at the top of the projects pane, above the current project, so pinning visibly moves a project up. The current project stays in its own section even when pinned.

### Fixed

- Pane and band colors now follow Claude's light and dark themes: the open project, filter pills, counters, alert and borders no longer stay dark in the light theme.
- In the projects pane, the hover highlight of a session stays on its "Open" button instead of a strip across the row; the row shows its border on hover.
- The pin button in the projects pane and the ▦ button in the band respond to hover and clicks again on Desktop.

## [0.4.0] - 2026-11-06

First public release. Versions before 0.4.0 were development milestones (phases 0 to 3 of [the spec](https://github.com/BrunoSSantana/claude-code-project-nav/blob/main/docs/SPEC.md)) and were not published.

### Added

- Context band above the prompt with project avatar and name, session title and git branch (F1).
- Session switcher in the band, with "+ New session" (F3); project name opens the pane (F4).
- Cross-session status: running, waiting and idle, written per session to `~/.claude/project-nav/live/` (F2).
- Band alert when another session waits for a permission or a question, with "Go to session" and "Later" (F6).
- Projects pane (`/p` or ▦) mirroring the Desktop sidebar: current, pinned and other projects, up to 5 sessions each, ordered by status and activity (F5, F7–F10, F15).
- Pins shared across sessions on the machine (F11).
- Pane search and status filters with counts, and an empty state (F12–F14).
- `/p <term>` autocomplete for projects and sessions (F16).
- Desktop deep links to open sessions, with a copy-to-clipboard fallback in the terminal.

[Unreleased]: https://github.com/BrunoSSantana/claude-code-project-nav/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/BrunoSSantana/claude-code-project-nav/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/BrunoSSantana/claude-code-project-nav/releases/tag/v0.4.0
