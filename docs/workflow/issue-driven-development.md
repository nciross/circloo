# Issue-driven development: no issue, no development

Every line of code traces back to a GitHub issue, and every feature issue traces back to a Spec-Kit plan.

```
idea issue ──▶ /speckit-specify ──▶ /speckit-clarify ──▶ /speckit-plan ──▶ /speckit-tasks ──▶ /speckit-taskstoissues ──▶ develop one task issue at a time ──▶ PR "Closes #N"
 (type:idea)    specs/NNN-x/spec.md   (questions)        plan.md, data-model,   tasks.md          task issues "T001: …"          (commit msgs reference #N)
                                                         contracts/                               (type:task)
```

## Steps
1. **Capture the idea** as a GitHub issue labelled `type:idea`. Claude can do this through the GitHub MCP server ("create an idea issue for …").
2. **Specify**: `/speckit-specify <idea, mention the issue #>`. This creates the branch `NNN-slug` and `specs/NNN-slug/spec.md`. The spec says *what* and *why*, never *how*.
3. **Clarify** (recommended): `/speckit-clarify`.
4. **Plan**: `/speckit-plan`. Technical design must respect `.specify/memory/constitution.md` and `docs/architecture/overview.md`. UI surfaces are shaped with `/impeccable shape`.
5. **Tasks**: `/speckit-tasks`, then `/speckit-analyze` for a consistency check.
6. **Issues are written after the plan**: `/speckit-taskstoissues` creates one GitHub issue per task (`T001: …`) through the GitHub MCP server, skipping tasks that already have one. Label them `type:task` and the matching `area:*`.
7. **Develop** one task issue at a time (`/speckit-implement` or by hand). Every commit message references the issue (`#N`). The `commit-msg` hook enforces this.
8. **PR** with `Closes #N`. CI (`.github/workflows/pr-checks.yml`) fails without a linked issue.
9. **Review and merge** with `/nicolas <PR#>`. Nicolas reviews with the specialist agents, fixes small issues, merges and updates the issues. See [nicolas.md](nicolas.md).

## Enforcement
| Where | What |
|---|---|
| `scripts/git-hooks/commit-msg` (enabled by `scripts/setup`) | Commit message must contain `#<number>` (merge/revert/fixup exempt) |
| `.github/workflows/pr-checks.yml` | PR body must contain `Closes/Fixes/Resolves/Refs #N`; Bicep must compile |
| `CLAUDE.md` + agents | Claude refuses to start coding without an issue and creates one via MCP instead |

Bugs and chores skip Spec-Kit but still need an issue (`type:bug` / `type:chore`).
