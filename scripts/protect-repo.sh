#!/usr/bin/env bash
# Keep main clean: squash-only merges with the PR title as the commit subject, auto-delete merged branches,
# and (when the GitHub plan allows rulesets) protect main and block non-conventional branch names server-side.
# Idempotent. Usage: ./scripts/protect-repo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_update_branch=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK >/dev/null
echo "✓ Merge settings: squash only, PR title = commit subject, merged branches auto-deleted."

if ! existing="$(gh api "repos/$REPO/rulesets" 2>/dev/null)"; then
  echo "! Rulesets unavailable for this repo (private repo on GitHub Free)."
  echo "  Upgrade to GitHub Pro or make the repo public, then re-run this script to enforce:"
  echo "  .github/rulesets/main.json and .github/rulesets/branch-names.json"
  echo "  Until then: local hooks + CI + branch-guard workflow + Nicolas's gates enforce the rules."
  exit 0
fi

for file in .github/rulesets/*.json; do
  name="$(node -e "console.log(require('./$file').name)")"
  id="$(printf '%s' "$existing" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(r?r.id:'')})" "$name")"
  if [ -n "$id" ]; then
    gh api -X PUT "repos/$REPO/rulesets/$id" --input "$file" >/dev/null && echo "✓ Updated ruleset: $name"
  else
    gh api -X POST "repos/$REPO/rulesets" --input "$file" >/dev/null && echo "✓ Created ruleset: $name"
  fi
done
