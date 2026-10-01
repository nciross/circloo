# Nicolas: the review → fix → merge → update-issues loop

Nicolas is circloo's lead maintainer agent. He closes the loop that [issue-driven development](issue-driven-development.md) opens: every merged line has an issue, and every merged PR leaves its issues accurate.

## Architecture

```
                         you: /nicolas <PR#> | sweep | ship <issue#>
                                          │
                     ┌────────────────────▼─────────────────────┐
                     │  /nicolas skill (main session)           │  .claude/skills/nicolas/SKILL.md
                     │  triage PR → pick specialists by paths   │
                     └──┬──────────────┬──────────────┬─────────┘
            always      │   UI changed │  infra changed│        (ship mode first runs `developer`)
              ┌─────────▼───┐  ┌───────▼──────┐  ┌────▼───────┐
              │  reviewer   │  │ ux-designer  │  │ azure-infra│   findings only, no edits
              │ spec, i18n, │  │ /impeccable  │  │ bicep, 1 RG│
              │ correctness │  │ audit,review │  │ invariant  │
              └─────────┬───┘  └───────┬──────┘  └────┬───────┘
                        └──────────────┼──────────────┘
                              ┌────────▼────────┐
                              │     nicolas     │  .claude/agents/nicolas.md
                              │ verify findings │
                              │ hard gates      │
                              └──┬──────┬────┬──┘
                small in-scope   │      │    │  big / out of scope
                 fix + push (#N) │      │    └──▶ request changes, label, new issue
                                 ▼      ▼
                         CI green → approve → squash-merge → delete branch
                                        │
                     close linked issues · comment summary · tick checklists
                     tasks.md follow-up PR · progress on parent idea issue
```

The skill is the orchestrator because Claude Code subagents can't start other subagents. Nicolas is a subagent so his context stays focused on one PR and his decision rules live in one file.

## Merge gates (all required)
| Gate | Check |
|---|---|
| Not a draft | `isDraft == false` |
| Linked issue | PR body has `Closes/Fixes/Resolves #N`, and commits reference `#N` |
| In scope | Diff matches the issue, with nothing unrelated |
| CI green | All checks completed and passing (never on pending) |
| Mergeable | No conflicts; stacked PRs merge base-first |
| Constitution | Tests for acceptance scenarios, 4 locales + RTL, Impeccable audit for UI, no secrets, SSO as config, Bicep compiles with one RG |

## What Nicolas may change
- **Fixes himself** (pushed to the PR branch, commit `fix: … (#issue)`): small (about ≤ 50 lines) and in scope. Examples: missing translation keys, typos, lint, obvious test fixes, `tasks.md` ticks.
- **Never**: force-push, rewrite history, `--admin` merges, disabling checks, commits to `main`, product decisions. Those become `--request-changes` plus a label, or a new issue.

## Labels
- `status:changes-requested`: Nicolas bounced the PR, so the author acts next.
- `status:ready-to-merge`: all gates passed (set just before merging).

## Usage
```text
/nicolas 12          # review, fix, merge PR #12 and update its issues
/nicolas sweep       # every open non-draft PR, stacked PRs in order
/nicolas ship 34     # developer implements issue #34 → PR → Nicolas merges
```
You can also ask in plain words: "nicolas, handle PR 12".
