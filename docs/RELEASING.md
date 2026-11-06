# Versioning and releases

## Version number

`project-nav` follows [Semantic Versioning](https://semver.org/). The single source of truth is the `version` field in [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json). Git tags and GitHub Releases mirror it; nothing else holds a version.

While the version is `0.x`, the public API is not considered stable:

| Change | Commit type | `0.x` bump | `≥ 1.0` bump |
| --- | --- | --- | --- |
| Breaking: on-disk format under `~/.claude/project-nav/`, removed command or behavior, higher minimum Claude Code version | `feat!` / `fix!` / `BREAKING CHANGE:` footer | minor (`0.4.0` → `0.5.0`) | major |
| New feature or requirement (`F<n>`) | `feat` | minor | minor |
| Bug fix, performance, internal change visible to users | `fix`, `perf` | patch (`0.4.0` → `0.4.1`) | patch |
| Docs, tests, CI, refactors with no behavior change | `docs`, `test`, `ci`, `refactor`, `chore` | no release needed | no release needed |

`1.0.0` is cut once every phase checklist in [SPEC.md](SPEC.md) has been verified live on Desktop and in the terminal.

## How users receive versions

Users install from the marketplace in this repository, which points at the repository root on the default branch. `claude plugin update project-nav` picks up what is on `main`, so **`main` must always be in a releasable state**: work happens on branches, and `main` only receives reviewed, passing pull requests.

Tags mark the exact commit of each release, and the GitHub Release holds its notes.

## Changelog

[CHANGELOG.md](../CHANGELOG.md) uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible pull request adds a line under `## [Unreleased]`, in one of `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. The release workflow publishes the section of the released version as the GitHub Release notes, so write entries for people who use the mod, not for people reading the diff.

## Cutting a release

1. **Pick the version** from the table above, based on what is under `## [Unreleased]`.

2. **Open a release branch** from an up-to-date `main`:

   ```bash
   git switch main && git pull && git switch -c release/v0.5.0
   ```

3. **Bump and document**:
   - set `"version": "0.5.0"` in `.claude-plugin/plugin.json`;
   - in `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.5.0] - YYYY-MM-DD`, add a new empty `## [Unreleased]` above it, and update the compare links at the bottom:

     ```
     [Unreleased]: https://github.com/BrunoSSantana/claude-code-project-nav/compare/v0.5.0...HEAD
     [0.5.0]: https://github.com/BrunoSSantana/claude-code-project-nav/compare/v0.4.0...v0.5.0
     ```

4. **Check**:

   ```bash
   claude plugin validate --strict . && claude plugin test .
   ```

5. **Merge** a pull request titled `chore(release): v0.5.0` into `main`.

6. **Tag the merge commit** with an annotated tag and push it:

   ```bash
   git switch main && git pull
   ```

   ```bash
   git tag -a v0.5.0 -m "v0.5.0"
   ```

   ```bash
   git push origin v0.5.0
   ```

7. **Let the release workflow finish.** [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every `v*.*.*` tag. It fails, and publishes nothing, if:
   - the tag does not match `version` in `plugin.json`;
   - `CHANGELOG.md` has no `## [x.y.z]` section for it;
   - validation or tests fail.

   Otherwise it creates the GitHub Release with that changelog section as notes.

## Tags

- Format: `v<major>.<minor>.<patch>` (`v0.4.0`), annotated, always on a commit in `main`.
- Never move or delete a pushed tag once its release is published. If a release is broken, ship a new patch version.
- A tag with a SemVer pre-release suffix (`v0.5.0-rc.1`, with the same `version` in `plugin.json`) is published as a GitHub pre-release. Since marketplace installs follow `main`, a pre-release only makes sense from a commit that is not yet on `main`.

## Fixing a failed release

- **Workflow failed before publishing** (version mismatch, missing changelog, failing tests): delete the tag locally and remotely, fix on a branch, merge, and tag again. This is the only case where deleting a tag is fine, because no release was published.

  ```bash
  git tag -d v0.5.0 && git push origin :refs/tags/v0.5.0
  ```

- **Release published with a bug**: leave it, fix on a branch, and release `v0.5.1`.
