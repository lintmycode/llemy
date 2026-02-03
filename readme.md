# LLEMY Bootstrap

## What is LLEMY
A workflow where Claude plans and Codex implements.

## Bootstrap Process

### 1. Create a requirement file
Write your feature in `<name>.md` (e.g., `llemy-be.md`)

### 2. Run Claude (Planner)
Give Claude this prompt:
```
Read <name>.md and proceed according to the LLEMY policy in .claude/claude.md.
Output only the required sections in the required format.
```

Claude outputs: `.llemy/todo/<repo>_<issue-number>.md` (implementation plan)

### 3. Run Codex (Implementer)
Give Codex the plan:
```
Implement this plan: [paste .llemy/todo/<repo>_<issue-number>.md body]
```

Codex implements the code.

### 4. Repeat
Write next requirement → Claude plans → Codex implements.

## Once LLEMY is built
Use GitHub issues with labels:
- `llemy-plan` → needs planning by Claude
- `llemy-todo` → ready for Codex to implement
- `llemy-done` → completed

Scripts will automate discovery and handoff.
