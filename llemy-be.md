# Automation: Scan repos for `llemy-plan` issues (GitHub labels)

## Goal
Create a Node.js script that reads a list of GitHub repositories from `repositories.txt` and outputs a report of all open issues labeled `llemy-plan`.

This is step 1 of the automation pipeline: **discover work that needs planning**.

## Context
- Repositories are tracked in a plain text file: `repositories.txt`
- Each line contains one repo in the format: `owner/repo`
- Lines starting with `#` should be ignored
- We will use GitHub labels to drive the workflow (`llemy-plan`, `llemy-todo`, `llemy-done`)
- We will use the `gh` CLI (already authenticated) to query issues

## Requirements
- Implement as a Node.js script (Node 20 compatible)
- Use 2-space indentation
- Do not add external dependencies (no npm packages)
- Script must use `gh issue list` to query issues

## Behaviour
For each repository in `repositories.txt`:
- Query issues labeled `llemy-plan`
- Only include **open** issues (default in `gh issue list`, but ensure it)
- Collect at least:
  - repo (`owner/repo`)
  - issue number
  - title
  - url
  - updatedAt
  - labels (names)

Output:
1) Human-readable console report grouped by repository, e.g.:
- `owner/repo (N)`
  - `#123 Title` + URL

2) A JSON snapshot written to:
- `.llemy/llemy-plan-issues.json`

The JSON must include:
- `generatedAt` (ISO timestamp)
- `label` (the label used, default `llemy-plan`)
- `repos` (array of repos scanned)
- `issues` (array of issues with the fields listed above)

## Config (Environment Variables)
Support these env vars with defaults:
- `LLEMY_PLAN_LABEL` (default: `llemy-plan`)
- `ISSUE_LIMIT` (default: `50`)
- `CONCURRENCY` (default: `3`)
- `OUTPUT_FILE` (default: `.llemy/llemy-plan-issues.json`)

## Error Handling
- If `repositories.txt` is missing or contains no valid repos, exit with non-zero code and a clear message
- If `gh` is not installed or not authenticated, exit with non-zero code and a clear message
- If one repo query fails, the script should:
  - continue scanning other repos
  - record an error entry for that repo in the JSON snapshot (so downstream steps can see it)

## Non-goals
- Do not create/modify issues or labels
- Do not run Claude or Codex yet
- Do not implement cron/launchd setup

## Acceptance Criteria
- Running the script produces a console report and writes `.llemy/llemy-plan-issues.json`
- It works with multiple repos, ignores commented lines, and handles failures gracefully
- No external dependencies, Node 20 compatible, 2-space indentation

## Notes for Planner (Claude)
- Output must be **implementation plan + Codex work order + review packet spec** (per our workflow)
- Do not write implementation code; that is a task for Codex

## Notes for Implementer (Codex)
For every `llemy-todo` issue:
- Create a feature branch
- Implement the issue exactly as written
- Commit all changes
- Push the branch to origin
- Add a completion comment summarising changes
- Do not merge
- Do not use sandbox CLI - always use the real `gh` CLI tool

## Labels
- `llemy-plan`
