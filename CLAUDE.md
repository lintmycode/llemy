# llemy

AI-assisted development workflow. Claude plans, Codex implements, using GitHub issues as the handoff layer.

## How It Works

```
GitHub issue (llemy-plan)
    ↓ llemy-plan.js pauses → Claude writes todo file
GitHub issue (llemy-todo)
    ↓ llemy-do.js pauses → Codex implements
GitHub issue (llemy-done)
```

## Commands

```bash
node scripts/llemy-init.js   # init repo: create .llemy/ dirs + GitHub labels
node scripts/llemy-plan.js   # process llemy-plan issues → Claude produces todo files (fully automated)
node scripts/llemy-do.js     # process llemy-todo issues → Codex implements (fully automated)
llemy do -id 123             # process one specific llemy-todo issue
```

## Issue Labels

| Label | Meaning |
|---|---|
| `llemy-plan` | Needs Claude to plan |
| `llemy-planned` | Claude has produced a todo |
| `llemy-todo` | Ready for Codex to implement |
| `llemy-done` | Complete |

## Policies

- `planner-policy.md` — Claude's role and output format (produces `.llemy/todo/` files)
- `executor-policy.md` — Codex's role and workflow rules

## Stack

- Node.js, ES modules, no dependencies
- `gh` CLI required and authenticated
- `bin/llemy.js` — global CLI entrypoint (`llemy` command)

## Implementation

`llemy plan` invokes `claude -p --dangerously-skip-permissions` as a subprocess. The subprocess env strips `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and `ANTHROPIC_API_KEY` to ensure subscription auth is used (not any API key loaded from `.llemy/.env`).

`llemy do` invokes `codex exec --cd <repo> --sandbox workspace-write` as a subprocess. Set `CODEX_MODEL` in the environment to pass a specific model to Codex.

## TODOs

- [ ] **EspoCRM CLI** — build a CLI interface to EspoCRM within llemy for manual CRM operations (update accounts, log time entries). Auth via API key. Self-hosted EspoCRM instance. Scope: interactive CLI, not automated — user drives all actions. See EspoCRM REST API `/api/v1/`.
