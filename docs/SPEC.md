# Spec: project and session navigation mod for Claude Code

This is the working spec the mod was built from, phase by phase, with Claude Code. It is kept as a record of the requirements, the investigation behind each decision, and what was verified live versus only under `claude plugin test`. Paths and project names in examples are illustrative.

## Context and goal

`project-nav` gives Claude Code clear navigation across projects and sessions without replacing anything that already exists. It shows where you are, what is running, and where you are needed, across every project at once.

The Desktop app sidebar mixes projects and sessions in a single list. It is hard to tell which session is waiting for a permission and to switch context quickly. The mod solves that with two pieces:

- **Band above the prompt**: shows the current project, session and branch, lets you switch sessions within the project, and warns you when another session needs you.
- **Projects pane**: lists every project with status, sessions, pins, search and filters.

Primary platform: the Code tab of the Desktop app. The mod also works in the terminal, with the limitations listed under Risks.

## Scope

The mod only adds navigation. The conversation, the prompt and the native sidebar stay exactly as they are.

| In | Out |
| --- | --- |
| Band above the prompt with project, session, branch and status | Any change to the conversation, messages or prompt |
| Switching sessions within the current project | Replacing or hiding the Desktop's native sidebar |
| Pane with every project, session and status | Switching project in one click (depends on phase 0) |
| Pinning projects, search, and status filters | Changing permissions or auto-approving tools |
| Cross-session status: waiting, running, idle | Cloud and WSL sessions, where mods do not draw |
| `/p` command and project autocomplete in the prompt | Syncing data across machines |

## Where the mod draws

The mod uses two render sites of the mods API and one autocomplete event. The visual reference is in [`design/`](design/): screens Mod A, B and C (`mod-a-painel-e-faixa.html`, `mod-b-busca.html`, `mod-c-alerta.html`). They are prototype HTML exported from a design tool, not mod code: the implementation uses the API's elements and reproduces layout and hierarchy, not every pixel.

| Piece | Render site / event | Reference screen | Shown in |
| --- | --- | --- | --- |
| Context band | `AbovePrompt` | Mod A (collapsed and expanded) and Mod C (alert) | Desktop and terminal |
| Projects pane | `Pane` with id `project-nav`, `placement: 'dock'` | Mod A | Desktop, terminal and VS Code |
| Pane search | `Pane`, search mode | Mod B | Desktop, terminal and VS Code |
| `/p <term>` autocomplete | `prompt.autocomplete` | Mod B, bottom | Desktop and terminal |

Visual rules for everything:

- **Status colors**: orange `#E8915F` for waiting on you, blue `#7AB0FF` for running, grey `#5C5C64` for idle. Orange and blue because they stay distinguishable for people with color blindness.
- **Project avatar**: a square with the name's two initials and a background color derived from the project path, always the same for the same project.
- **Allowed elements**: only `Box`, `Text`, `Button`, `Input`, `Select` and `Svg`, all drawn by the host surface. No free-form HTML unless phase 0 approves the `Client` element.
- **As implemented**: the avatar is an `Svg` (rounded square with initials) on Desktop and a `Text` with background in the terminal; counters and branch are `Box`es with a background; session title, filters, "Open" and ▦ are bordered `Button`s (`variant`). `Button` only takes text, so the pin is a glyph (★/☆) and status dots sit outside it.

## Functional requirements

Each requirement has a code that phases and tests refer to.

### Band above the prompt

- **F1 · Current context**: shows the project avatar and name, the session title and the current git branch. The title is the session summary; without one, the first words of the first prompt.
- **F2 · Other projects summary**: "N waiting" (orange) and "N running" (blue) counters, counting other sessions only. A zero counter is hidden.
- **F3 · Switch session**: the session title is a button with a chevron. Clicking it expands the band upward with the current project's sessions (status, branch, last activity) and a "+ New session" button. Picking a session switches to it.
- **F4 · Project name**: opens the projects pane. It does not switch project directly.
- **F5 · Pane button**: a grid icon that toggles the pane, same as `/p`.
- **F6 · Alert**: when another session starts waiting on you, the band expands with the project, the session and the reason (e.g. the command asking for permission), plus "Go to session" and "Later". "Later" collapses the alert until that session's next request.

### Projects pane

- **F7 · Open and close**: `/p` and the band button. The pane remembers whether it was open across sessions.
- **F8 · Sections**: "Pinned" on top, then "Current project", then "All others". Header with the project total. (Until 0.4.0 "Current project" came first; pinned moved to the top in 0.4.1 so that pinning visibly lifts a project.)
- **F9 · Project row**: avatar, name, a status line ("Waiting for your permission", "1 session running" or "Last activity <date>") and the pin button. Clicking the row expands that project's sessions.
- **F10 · Project sessions**: up to 5 most recent, with status dot, title and last activity. The open session shows "this session"; clicking any other opens it.
- **F11 · Pin**: the pin toggles. Pins are saved for every session on the machine. The current project always shows under "Current project", even when pinned.
- **F12 · Search**: a field filtering by name or path, case-insensitive. With a filter active, "All others" becomes "Results".
- **F13 · Status filters**: All, Waiting, Running and Idle buttons, each with its count. They combine with search.
- **F14 · Empty**: with no results, shows "No project matches this filter" and a "Clear filters" button.
- **F15 · Order**: within each section, waiting first, then running, then by last activity, most recent first.

### Prompt search

- **F16 · Autocomplete**: typing `/p <term>` suggests projects and sessions matching the term. Picking one opens the pane already filtered.

## Architecture

Each session running the mod publishes its own state to a shared location and reads the state of the others. Project and session history comes from the Desktop session registry and Claude Code's transcripts in `~/.claude/projects/`.

### File layout

```
project-nav/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── hooks/
│   ├── hooks.json          # "modules": ["./register.tsx"]
│   └── register.tsx        # entry: register(on, options)
├── src/
│   ├── index.ts            # scanning, cache, session/project reads
│   ├── live.ts             # this session's live status on disk
│   ├── status.ts           # counters, alert, reasons (pure)
│   ├── model.ts            # grouping, filters, ordering (pure)
│   ├── band.tsx            # ui.render for AbovePrompt
│   ├── pane.tsx            # ui.render for the Pane
│   ├── avatar.tsx          # avatar, pin, shared elements
│   └── open.ts             # deep links and the copy fallback
├── types/index.d.ts        # $.state contract
└── tests/*.test.ts(x)
```

### Data sources

| Data | Source | Notes |
| --- | --- | --- |
| Project list | Desktop session registry (`~/.config/Claude/claude-code-sessions/<account>/<org>/local_*.json`) | Grouped like the sidebar: see "Projects: the Desktop rule" |
| A project's sessions | The folder's `.jsonl` files, sorted by modification time (`$.fs.stat`) | `$.fs.read` reads up to 4 MiB; large files are read partially through `$.process.run` |
| Session title | Desktop `title`, else the last `custom-title` line, else the first prompt cut to 60 characters | |
| Current project, session and branch | `$.session.cwd()`, `$.session.id()`, `$.session.repo()` | `repo()` carries no branch: `git branch --show-current` |
| Other sessions' status | `~/.claude/project-nav/live/<sessionId>.json` | One per session running the mod (see phase 3) |

### Persisted keys

| Key | Content | Writer |
| --- | --- | --- |
| ~~`nav:live:<sessionId>`~~ → `live/<sessionId>.json` | `{ sessionId, localId?, projectPath, title, branch, status, reason?, updatedAt }` | The session itself; its own file instead of `$.store` (see phase 3) |
| ~~`nav:pins`~~ → `pins.json` | `{ [projectPath]: true }` | Any session, on pin/unpin |
| `nav:index` | Not implemented: the `mtime` cache lives in module memory and restarts on each reload | — |
| `nav:ui` | `{ paneOpen }`; the filter lives in the session's `$.state`, dismissed alerts in `dismissed.json` | The session where the person acted |

`$.store` holds 4 MiB total. The cache keeps at most 50 sessions per project and 200 projects.

### Events and status

| Event | What the mod does |
| --- | --- |
| `session.start` | Writes its live entry as idle, starts a 15 s heartbeat (`$.clock.every`) and a 5 s read of other sessions, reopens the pane if `paneOpen` |
| `turn.start` | Status becomes running |
| `tool.check` | Calls `next(e)`; if the decision is `ask`, status becomes waiting, with the reason (tool and command summary) |
| `tool.call` | `AskUserQuestion` sets waiting before the question; any call that ends while waiting returns to running |
| `turn.complete` | Status becomes idle |
| `session.end` | Deletes its live entry |
| `ui.render` on `AbovePrompt` and `Pane` | Draws the band and the pane |
| `ui.press`, `ui.input` | Buttons, pins, filters and search |
| `prompt.autocomplete` | Suggestions for `/p <term>` |

A live entry whose `updatedAt` is older than 60 s is treated as a closed session (the app may have crashed without firing `session.end`). Every state change calls `$.ui.invalidate('ui.render')`.

## Delivery phases

Five phases, each testable on its own. Phase 0 is an investigation whose outcome could change F3, F6 and F10.

### Phase 0 · Proof of concept

Answer what the documentation leaves open, with a minimal mod loaded through `claude --plugin-dir`.

- [x] Find out whether `$.command.run` can trigger `/resume <id>` and switch session on Desktop
- [x] Find any way to open another project's session from a button
- [x] Confirm the `.jsonl` format: `cwd`, `sessionId`, `gitBranch`, summary line
- [x] Confirm what `$.session.repo()` returns
- [x] Test whether the `Client` element accepts a web UI on Desktop
- [x] Record the answers under "Phase 0 results"

### Phase 1 · Context band (F1, F3, F4)

- [ ] The band shows the right project, session and branch when a session opens
- [ ] The branch updates after a `git checkout` run by Claude
- [ ] The project's session list opens and closes from the title
- [x] Picking a session switches to it (or falls back to the plan B from phase 0)

Implementation notes:
- Title: Desktop `title`, else the last `custom-title` line, else the person's first prompt (up to 60 characters, cut at a word), else "Untitled session".
- "Open" and "+ New session" use `claude://code/continue` and `claude://code/new?folder=` on Desktop; in the terminal, or without a `local_id`, they copy `cd '<folder>' && claude [--resume <id>]` and show a toast.
- The branch is re-read after every `Bash` call that mentions `git`, on every turn and every 30 s; outside a repository the band shows no branch.
- Engine constraints found: a function that receives `$` in another file must be a `function`, not an arrow; each file declares its own `atom`s; the matcher's `requestId` must be a literal.
- The scan uses `find -printf` (GNU). macOS needs another way to list with mtime.

### Phase 2 · Projects pane (F5, F7 to F10, F15)

- [ ] `/p` and the band button toggle the pane (implemented; not tested live)
- [x] The pane lists the Desktop sidebar's projects (not those under `~/.claude/projects/`: see "Projects: the Desktop rule"), with up to 5 sessions when expanded
- [ ] The first scan finishes in under 2 s; later ones use the cache (not measured)
- [x] Order follows F15

Implementation notes:
- Source: the Desktop's `local_*.json` from the current session's `<account>/<org>` folder, archived ones excluded; key `originCwd || cwd`; name from the GitHub repo (`origin`) or the folder. Pure functions in `model.ts` (`sidebarScope`, `groupProjects`, `projectLabel`, `paneSections`, `projectStatusLine`), reads in `readProjects` (`index.ts`), in the same scan as the band (on open, every 30 s and every turn).
- `git remote get-url origin` runs once per project and is cached until the mod reloads.
- A project with more than 5 sessions shows "+ N in the Desktop sidebar".
- F7: open/closed is kept in `nav:ui.paneOpen` in `$.store`; the pane's X records closed (`ui.close`, origin `person`). A new session reopens the pane if it was open.

### Phase 3 · Cross-session status (F2, F6)

- [ ] With two sessions open, a permission request in one shows as waiting in the other within 5 s
- [ ] The band alert appears and "Later" collapses it until the next request
- [ ] Force-closing a session clears its status within 60 s
- [ ] Band counters match the pane

Implementation notes (covered by `claude plugin test`; the items above need two real sessions and have not been checked live):
- **Deviation from the spec:** status is not kept under `nav:live:*` in `$.store`. `$.store` is a single JSON file per plugin, and several sessions writing every 15 s would overwrite each other. Each session writes `~/.claude/project-nav/live/<sessionId>.json` (`live.ts`); pins and dismissed alerts live in `pins.json` and `dismissed.json` in the same folder.
- A render hook cannot write, and `tool.call` also covers denials, so it replaces the originally planned `classic.PostToolUse` and `ui.render` on `AskUserQuestion`.
- "Later" stores a hash of the reason; the alert returns if the reason changes. Pure functions in `status.ts`.

### Phase 4 · Pins, search and filters (F11 to F14, F16)

- [ ] Pinning in one session shows as pinned in another open one
- [ ] Search and status filters combine and show the right counts
- [ ] The empty state with "Clear filters" works
- [ ] `/p <term>` suggests projects and sessions

Implementation notes (covered by `claude plugin test`; live check pending):
- Pin ★/☆ on each project (text: `Button` does not take an `Svg`). Writes `pins.json`; other sessions pick it up on their next scan (up to 30 s).
- Search (`Input`, absent on mobile) and filters with counts over all projects; with a filter active, "All others" becomes "Results".
- Running `/p <term>` opens the pane with the search filled in. Search and filter are per session (`$.state`), not shared.

Every phase: `claude plugin validate --strict` with no warnings and `claude plugin test` passing (35 tests: `model`, `status`, band and pane, on terminal and Desktop surfaces).

## Risks and open decisions

The biggest risk is switching sessions: if phase 0 found no way, the open buttons become copy shortcuts and navigation stays in the native sidebar.

| Risk | Impact | Plan B |
| --- | --- | --- |
| The mod cannot switch sessions | F3, F6 and F10 lose their main action | The button copies `cd <folder> && claude --resume <id>` with `$.ui.copy` and points at the session in the native sidebar |
| Switching project requires changing the session's directory | Opening another project's session fails inside Desktop | Same plan B; the pane becomes a control center |
| The `.jsonl` format changes in an update | Titles or paths disappear from the pane | Defensive reads: a missing field becomes the folder name and "Untitled session" |
| "Waiting" detected wrongly | False or missing alerts | Test with permission asked, denied, approved and with `AskUserQuestion` |
| Slow pane with many projects | Opening stalls | `mtime` cache and background scan |
| Narrow terminal | Pane shows above the prompt, not beside it | Accepted: below 144 columns Claude Code moves the pane itself |
| Elements the terminal does not draw (`Svg`) | Icons vanish | Text or characters instead when `e.surface` is `terminal` |

Open decisions:

- [ ] Open the pane automatically in every new session, or only on `/p`?
- [ ] Should the F6 alert also play a sound (`$.audio`)?
- [ ] Hide projects with no session in 90+ days behind a "Show older"?

## Phase 0 results

Probe: a temporary `/nav-probe` command opened the `project-nav` pane with the data below and test buttons. Run on 2026-10-29 with Claude Code 2.1.309 on Desktop (Linux), surface `desktop`.

**1. `$.command.run` and `/resume`: not usable on Desktop.** `$.command.list()` returns 189 commands and `resume` is not among them; `$.command.run` rejects unknown names. The mods API has no way to switch sessions.

**2. Opening another project's session.** Found outside the mods API: the Desktop app registers the `claude://` scheme and handles
- `claude://code/continue?session=local_<id>`: opens the Desktop session with that id, from any project;
- `claude://code/new?folder=<path>`: a new session in that folder ("+ New session").

The id is the Desktop's (`local_…`), not the CLI's. The mapping lives in `~/.config/Claude/claude-code-sessions/<account>/<org>/local_*.json`, with `sessionId` (local), `cliSessionId`, `cwd`, `originCwd`, `title`, `lastActivityAt`, `isArchived`, `interruptedAwaitingPerson`. The mod opens the link with `$.process.run(['xdg-open', url])` (Linux; `open` on macOS).

Live: the button opened a `claude://code/continue?session=local_…` link and Desktop focused that session in about 1 s (a second app instance hands over the URL and exits, then `setFocusedSession`). The tested session was in the same project; the handler looks the id up among all Desktop sessions regardless of folder, so another project should work the same (not tested). `/new?folder=` was not tested.

Risk: undocumented format and route, may change in an app update. In the terminal there is no session switch: plan B (copy `claude --resume`) applies.

**3. `.jsonl` format.**
- There is no `summary` line. The title comes from `custom-title` lines (`customTitle`), rewritten several times: the last one wins. There are also `agent-name` and `last-prompt` (`lastPrompt`). For Desktop sessions, `title` in `local_*.json` is the simplest source.
- `cwd`, `sessionId` and `gitBranch` are on every `user`, `assistant`, `attachment` and `system` line; the first lines are `queue-operation`, without `cwd`. `gitBranch` is `HEAD` outside a repository.
- The folder name replaces every non-alphanumeric character with `-` (`/home/a/.claude` → `-home-a--claude`): it cannot be decoded, the real path comes from `cwd`.
- A project folder holds sessions whose `cwd` is in its subfolders.
- Files reach 20 MB (> 4 MiB of `$.fs.read`): title and `cwd` are read with `grep`/`tail` through `$.process.run`.

**4. `$.session.repo()`** returns `{ root, remote, internal, name }`, or `null` outside a repository. No branch: use `git branch --show-current` (empty on a detached HEAD). The band must handle "no repository" by hiding the branch.

**5. `Client`.** From the types, `Client` is not HTML: it is a mod module (`ClientModule`) drawing with the same element table, with local state and keyboard/pointer events. It exists on `desktop` and `terminal`, not on `vscode` or `mobile`. There is no free-form web UI; the allowed-elements rule stands.

**Impact on later phases.**
- F3, F6, F10: "Open"/"Go to session" use the deep link on Desktop; plan B (copy) in the terminal and without a `local_id`.
- "+ New session" uses `claude://code/new?folder=`.
- `local_*.json` also gives status for sessions without the mod (`interruptedAwaitingPerson`, `lastActivityAt`): a candidate to complement live entries.

## Projects: the Desktop rule

Investigated on 2026-10-29 with Claude Desktop and Claude Code 2.1.309 (Linux). The pane's project list is the one in the Desktop sidebar's "Sessions" section, grouped by project. `~/.claude/projects/` does not work: it has folders for subfolders, worktrees and terminal sessions that the sidebar does not show.

**Source.** The Desktop session registry, `~/.config/Claude/claude-code-sessions/<account>/<org>/local_*.json`.
- One folder per account and, inside, one per organization. The current account is `lastKnownAccountUuid` in `~/.config/Claude/config.json`.
- The mod does not read `config.json` (it holds the OAuth token cache): it uses the folder holding the current session's own `local_*.json` (`cliSessionId` equal to `$.session.id()`). Without one (a terminal session), it uses the folder with the most recently active session.

**Which sessions count.** Those with `isArchived: false`. The "Sessions" section uses `group_by: project`, `status: active` by default and no day limit.

**Group key: `originCwd || cwd`.** The same expression the app's own code uses. A worktree session (`cwd` = `<repo>/.claude/worktrees/<name>`) has `originCwd` = the repo root and lands in the repo's group. A session opened in a subfolder gets its own group, under its path.

**Group name.** The repository name when the `origin` remote points to github.com; otherwise the last path segment.
- The app reads `git remote get-url origin` and parses `user@host:owner/name(.git)` and `https|ssh|git://host/owner/name(.git)`. The name only counts when the host is `github.com`.
- Azure DevOps remotes (`git@ssh.dev.azure.com:v3/org/project/repo`) do not pass the parser and keep the folder name.
- Example: a folder `~/work/checkout-web` whose `origin` is `github.com/acme/Storefront.git` shows in the sidebar as **Storefront**.

**Custom groups and sections.** The sidebar supports manual groups and Pinned and Routines sections. The mod does not read those (they live in app state, not in a file the mod can reach) and ignores the sidebar's order: the pane sorts by F15.

Uncertainties:
- The code that draws the sidebar is not in `app.asar` (it likely comes from the web UI the app loads). Key and name come from the main process code and match the sidebar, but the final grouping was not read.
- Two folders with the same GitHub repo: the mod shows two projects with the same name. Whether the sidebar merges them is unknown.

## Using this spec with Claude Code

Ask for one phase at a time in plan mode. Claude Code ships the mod-authoring skill, so it knows the structure and the API.

1. Test with `claude --plugin-dir ./project-nav` in the terminal. The mod reloads when you save.
2. To test on Desktop, put the folder's absolute path in `CLAUDE_CODE_PLUGIN_DIRS`, under `env` in `~/.claude/settings.json`, and reopen the session.
3. Review phase 0 results, adjust the spec if anything changed, then ask for phase 1. Repeat through phase 4.

Minimum: Claude Code v2.1.287 in the terminal or v2.1.286 on Desktop.

References: [mods overview](https://code.claude.com/docs/en/plugins/mods/overview) and [mods reference](https://code.claude.com/docs/en/plugins/mods/reference).
