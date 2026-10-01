#Requires -Version 7
<#
.SYNOPSIS
  Keep main clean: squash-only merges with the PR title as the commit subject, auto-delete merged branches,
  and (when the GitHub plan allows rulesets) protect main and block non-conventional branch names server-side.
  Idempotent.
#>
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false   # gh exit codes are checked by hand below
Set-Location (Join-Path $PSScriptRoot '..')
$repo = gh repo view --json nameWithOwner -q .nameWithOwner
if ($LASTEXITCODE -ne 0) { throw 'gh repo view failed. Is gh logged in?' }

gh api -X PATCH "repos/$repo" `
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false `
  -F delete_branch_on_merge=true -F allow_update_branch=true `
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Updating the merge settings failed.' }
Write-Host '✓ Merge settings: squash only, PR title = commit subject, merged branches auto-deleted.'

$existing = $null
try { $existing = gh api "repos/$repo/rulesets" 2>$null } catch { $existing = $null }
if ($LASTEXITCODE -ne 0 -or -not $existing) {
  Write-Host '! Rulesets unavailable for this repo (private repo on GitHub Free).' -ForegroundColor Yellow
  Write-Host '  Upgrade to GitHub Pro or make the repo public, then re-run this script to enforce'
  Write-Host '  .github/rulesets/main.json and .github/rulesets/branch-names.json.'
  Write-Host "  Until then: local hooks + CI + branch-guard workflow + Nicolas's gates enforce the rules."
  exit 0
}
$existing = $existing | ConvertFrom-Json

foreach ($file in Get-ChildItem .github/rulesets/*.json) {
  $name = (Get-Content $file -Raw | ConvertFrom-Json).name
  $match = $existing | Where-Object name -eq $name
  if ($match) {
    gh api -X PUT "repos/$repo/rulesets/$($match.id)" --input $file.FullName | Out-Null; $verb = 'Updated'
  } else {
    gh api -X POST "repos/$repo/rulesets" --input $file.FullName | Out-Null; $verb = 'Created'
  }
  if ($LASTEXITCODE -ne 0) { throw "Applying ruleset '$name' failed." }
  Write-Host "✓ $verb ruleset: $name"
}
