# Contributing

Thanks for your interest in `project-nav`. Bug reports, ideas and pull requests are welcome.

## Before you start

- **Bugs**: open an issue with the bug template. Include your Claude Code version (`claude --version`), the surface (Desktop, terminal or VS Code), your OS, and what the band or pane showed versus what you expected.
- **Features**: open an issue first so we can agree on the behavior. New behavior gets a requirement code in [docs/SPEC.md](docs/SPEC.md) (the next free `F<n>`), so it can be referenced from code and tests.
- **Small fixes** (typos, docs, an obvious bug): a pull request on its own is fine.

## Setup

You need Claude Code **v2.1.287+** and, for type-checking, TypeScript (`tsc`).

```bash
git clone https://github.com/BrunoSSantana/claude-code-project-nav.git
```

```bash
cd claude-code-project-nav && claude --plugin-dir .
```

The mod loads in that session and reloads whenever you save a file. Loading it once also makes Claude Code write the engine's types to `.claude-plugin/types/` (git-ignored), which `tsconfig.json` extends.

To try it in Desktop sessions, point `CLAUDE_CODE_PLUGIN_DIRS` at your clone (see the README's Development section) and reopen the session. If you also have the published version installed, disable it while developing so the two don't both draw.

## Checks

CI runs validation and tests on every pull request:

```bash
claude plugin validate --strict .
```

```bash
claude plugin test .
```

Also type-check locally before opening the PR. CI can't do this step, because the engine types only exist after Claude Code has loaded the mod:

```bash
tsc -p . --noEmit
```

## Code guidelines

- **Keep logic pure.** Grouping, filtering, ordering, counters and alert rules go in `src/model.ts` or `src/status.ts`, without `$`, and get unit tests. Hooks and render code should only read state, call those functions and draw.
- **Test both surfaces.** Rendering tests run on `terminal` and `desktop`; the terminal has no `Svg`, so any new visual needs a text fallback.
- **Engine constraints** found while building (see the spec's phase notes):
  - a function in another file that receives `$` must be a `function` declaration, not an arrow function;
  - each file declares its own `atom`s;
  - a `ui.render` matcher's `requestId` must be a literal;
  - render hooks cannot write state: do writes in event hooks;
  - no JSX Fragment (`<>`) inside a row: Desktop draws it as a box of its own and the row turns into a column.
- **New `$.state` values** must be declared in `types/index.d.ts`; `claude plugin validate` holds the module to that contract.
- **Read defensively.** The Desktop registry and `.jsonl` transcripts are undocumented formats: a missing field must degrade (folder name, "untitled session"), never throw.
- **No real data in tests or docs.** Use fictional paths and project names (`/home/a/dev/api-payments`, `acme/webapp`).

## Commits and branches

- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`, imperative, lowercase, no period, subject up to 50 characters.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`.
  - Scopes: `band`, `pane`, `status`, `model`, `live`, `open`, `hooks`, `docs`, `ci`.
  - Example: `fix(band): hide branch outside a git repository`.
- A breaking change (e.g. a new on-disk format under `~/.claude/project-nav/`) gets a `!` after the type and a `BREAKING CHANGE:` footer.

Commit types map to version bumps; see [docs/RELEASING.md](docs/RELEASING.md).

## Pull requests

1. Keep the PR focused on one change.
2. Add or update tests for behavior changes.
3. Update [docs/SPEC.md](docs/SPEC.md) when requirements or architecture change, and say whether the behavior was checked live or only under `claude plugin test`.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
5. Fill in the PR template, including the surfaces you tested on.

Maintainers squash-merge, so the PR title must itself be a valid Conventional Commit.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
