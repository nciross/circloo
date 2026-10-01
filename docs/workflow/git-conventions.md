# Git conventions: keeping main clean

Goal: `main` reads like a changelog. It has **one squash commit per PR**, each one conventional and linked to an issue. Branches are short-lived and deleted on merge.

```
main:  ● feat(mood): one-tap daily check-in (#42) (#51)
       ● fix(boards): RTL toolbar order (#57) (#58)
       ● chore(git): clean main, conventional branches and commits (#12) (#13)
```

## Branches: `<type>/<number>-<slug>`
- `<type>`: `feat|fix|chore|docs|refactor|test|ci|perf|build|style|revert`
- `<number>`: the GitHub issue number. Spec-Kit feature branches use the spec number (`feat/001-email-sign-in`), and their spec links the idea issue.
- `<slug>`: lowercase words joined by hyphens.
- Examples: `feat/42-daily-checkin`, `fix/57-rtl-board-toolbar`, `chore/12-git-conventions`.
- Branches are short-lived: one issue, one PR, deleted automatically on merge.

## Commits: Conventional Commits + issue
```
<type>(<optional scope>)<optional !>: <description> (#<issue>)
```
`feat(boards): dot voting (#42)`, `fix(auth)!: magic links expire after 15 min (#60)`. The issue reference may also go in the body (`Refs #42`). Use `fixup!` commits freely, but autosquash them (`git rebase -i --autosquash`) before pushing.

## Pull requests
- **Title** = the future commit on `main`. It must be a Conventional Commit subject with `(#issue)`.
- **Body** contains `Closes #N`.
- **Merge**: squash only, done by Nicolas (`/nicolas <PR#>`) after review. He sets the `nicolas/review` approval status, squash-merges with the subject `<PR title> (#PR)` and a body of `Closes #N`, deletes the branch and updates the issues.

## Enforcement
| Layer | Blocks | Where |
|---|---|---|
| `reference-transaction` hook | **Creating** a local branch with a bad name | `scripts/git-hooks/` |
| `commit-msg` hook | Non-conventional commits, commits without `#N` | `scripts/git-hooks/` |
| `pre-push` hook | Pushing to `main`, pushing bad branch names or bad commits, unsquashed `fixup!` | `scripts/git-hooks/` |
| CI `Conventions` | Bad branch name, PR title or any commit in the PR | `.github/workflows/pr-checks.yml` |
| CI `No issue, no development` | PR without `Closes #N` | same |
| Branch guard | Deletes any non-conventional branch pushed to GitHub | `.github/workflows/branch-guard.yml` |
| Repo settings | Merge commits and rebase merges (squash only); merged branches auto-deleted | `scripts/protect-repo.*` |
| Rulesets *(GitHub Pro or public repo)* | Direct pushes/force-pushes to `main`, merging without green checks + `nicolas/review`, creating bad branch names | `.github/rulesets/*.json`, applied by `scripts/protect-repo.*` |
| Nicolas | Merging anything that fails a gate | `.claude/agents/nicolas.md` |

The hooks are enabled by `scripts/setup.*` (`git config core.hooksPath scripts/git-hooks`). A repo admin runs `scripts/protect-repo.*` once, and again after changing the plan or a ruleset file. The shared regexes live in `scripts/git-hooks/_conventions.sh` and are used by both the hooks and CI.

> **Current limit:** the repo is private on GitHub Free, so rulesets can't be enforced yet. GitHub will still *allow* a human to merge a red PR or push to `main` from a machine without the hooks. Upgrade to Pro or make the repo public, then re-run `scripts/protect-repo.ps1`.
