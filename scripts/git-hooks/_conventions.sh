#!/usr/bin/env sh
# Single source of truth for circloo git conventions. Sourced by the git hooks and by CI.
# See docs/workflow/git-conventions.md.

CONV_TYPES='feat|fix|chore|docs|refactor|test|ci|perf|build|style|revert'

# Branch: <type>/<number>-<slug>   e.g. feat/42-daily-checkin, fix/57-rtl-board-toolbar, feat/001-daily-mood (Spec-Kit)
CONV_BRANCH_RE="^($CONV_TYPES)/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*\$"

# Commit subject / PR title: <type>(<scope>)!: <description>   (scope and ! optional)
CONV_SUBJECT_RE="^($CONV_TYPES)(\([a-z0-9][a-z0-9-]*\))?!?: [^ ].{0,98}\$"

# Issue reference anywhere in the message
CONV_ISSUE_RE='#[0-9]+'

conv_branch_ok()  { printf '%s\n' "$1" | grep -Eq "$CONV_BRANCH_RE"; }
conv_subject_ok() { printf '%s\n' "$1" | grep -Eq "$CONV_SUBJECT_RE"; }
conv_issue_ok()   { printf '%s\n' "$1" | grep -Eq "$CONV_ISSUE_RE"; }

conv_branch_help() {
  echo "   Branch names must be <type>/<number>-<slug>, e.g. feat/42-daily-checkin or fix/57-rtl-toolbar" >&2
  echo "   <type> = feat|fix|chore|docs|refactor|test|ci|perf|build|style|revert, <number> = issue (or Spec-Kit feature) number." >&2
}
conv_commit_help() {
  echo "   Commit messages must be Conventional Commits and reference an issue:" >&2
  echo "     feat(mood): one-tap daily check-in (#42)" >&2
  echo "   <type> = feat|fix|chore|docs|refactor|test|ci|perf|build|style|revert; optional (scope) and ! for breaking." >&2
}
