---
name: nicolas
description: "Run Nicolas, circloo's lead maintainer: review, fix and merge pull requests and update their issues. Usage: /nicolas <PR#> | /nicolas sweep | /nicolas ship <issue#>"
argument-hint: "<PR number> | sweep | ship <issue number>"
user-invocable: true
---

# /nicolas

You orchestrate **Nicolas** (`.claude/agents/nicolas.md`) and the specialist subagents. Subagents can't start other subagents, so the fan-out happens here in the main session. Architecture and gates: `docs/workflow/nicolas.md`.

## Input
```text
$ARGUMENTS
```

## Modes

### `/nicolas <PR#>`: take one PR to a decision
1. **Triage**: `gh pr view <PR> --json number,title,isDraft,baseRefName,files,closingIssuesReferences`. If there's no linked issue, bounce it and stop:
   ```bash
   gh pr comment <PR> --body 'No issue, no development: please add "Closes #N" to the PR description.'
   gh pr edit <PR> --add-label status:changes-requested
   gh api repos/{owner}/{repo}/statuses/$(gh pr view <PR> --json headRefOid -q .headRefOid) \
     -f state=failure -f context=nicolas/review -f description="No linked issue"
   ```
   Nicolas fixes a non-conventional PR title or branch name himself. Non-conventional commits get bounced (see `docs/workflow/git-conventions.md`).
2. **Specialist reviews**, in parallel in one message, chosen by the changed paths:
   - always: `reviewer` (traceability, spec, correctness, i18n)
   - UI files (`src/web/**/*.{tsx,css}`, `messages/**`, `DESIGN.md`): `ux-designer`, asked to run `/impeccable audit` and `/impeccable critique` on the changed surfaces
   - `infra/**`, `azure.yaml`, `scripts/deploy*|destroy*`: `azure-infra`, asked to validate and check the single-RG invariant
   Give each one the PR number, the linked issues and the instruction "report findings only, don't edit".
3. **Decision**: launch the `nicolas` subagent with the PR number and the specialists' findings verbatim. He fixes small issues, requests changes or merges, then updates the issues.
4. Relay Nicolas's report to the user.

### `/nicolas sweep`: every open PR
1. `gh pr list --state open --json number,title,isDraft,baseRefName,headRefName,closingIssuesReferences`
2. Skip drafts. Order stacked PRs so that a PR whose base is another open PR's branch comes after that PR. Unrelated PRs may be processed in parallel. Stacked ones run sequentially.
3. Run the single-PR flow for each, then print one summary table: PR → decision → issues updated.

### `/nicolas ship <issue#>`: from issue to merged code
1. Confirm the issue exists and is a `type:task`, `type:bug` or `type:chore` (a `type:idea` goes through `/speckit-specify` first, so stop and say so).
2. Launch `developer` with the issue number. It implements on a branch, commits with `#N` and pushes.
3. Open the PR: `gh pr create --title "<type>: <summary> (#N)" --body "Closes #N …"`.
4. Wait for CI (`gh pr checks <PR> --watch`), then run the single-PR flow above.

## Guardrails
- Merging is an outward-facing action. Each `gh pr merge` goes through the normal permission prompt unless the user has allowed it.
- `main` only gets squash merges (`--squash --delete-branch`, subject `<PR title> (#PR)`). Never merge with pending or failing checks, never use `--admin`, never commit to `main`. The only force-push allowed is `--force-with-lease` when restacking a dependent short-lived branch after its base was squash-merged.
