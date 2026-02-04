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

Claude outputs: `.llemy/todo/<repo>_<issue-number>_todo.md` (implementation plan)

### 3. Run Codex (Implementer)
Give Codex the plan:
```
Implement this plan: [paste .llemy/todo/<repo>_<issue-number>_todo.md body]
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

## USAGE

### Initialize in current repo

Set up local folders and required GitHub labels for the repository in your current working directory.

```bash
node scripts/llemy-init.js
```

**What it does:**
- Creates `.llemy/`, `.llemy/plan/`, `.llemy/todo/`, `.llemy/logs/`, and `.llemy/.env`
- Creates/updates labels: `llemy-plan`, `llemy-planned`, `llemy-todo`, `llemy-done`

**Requirements:**
- `gh` CLI authenticated
- Command run inside a GitHub repo

**Optional:**
- Set `LLEMY_REPO=owner/name` to target a different repo explicitly
- Put LLEMY settings in `.llemy/.env` (loaded automatically by all scripts)

---

### Planning Workflow (llemy-plan → llemy-todo)

Process GitHub issues labeled `llemy-plan` and convert them to `llemy-todo` implementation plans.

**Steps:**

1. **Start the script in a terminal:**
   ```bash
   node scripts/llemy-plan.js
   ```

2. **The script will:**
   - Scan repos for `llemy-plan` issues
   - Fetch each issue and create a plan file: `.llemy/plan/<repo>_<issue>_plan.md`
   - **PAUSE** and print an instruction like:
     ```
     [repo#123] ⏸️  Paused - run this in Claude Code to continue:
     [repo#123]    "Process plan file .llemy/plan/... and create .llemy/todo/..."
     ```

3. **In Claude Code (VSCode), send the printed instruction:**
   - Copy the instruction from the terminal
   - Paste it into Claude Code chat
   - Claude reads the plan and writes `.llemy/todo/<repo>_<issue>_todo.md`

4. **Script auto-resumes:**
   - Detects the todo file
   - Creates GitHub issue with `llemy-todo` label
   - Relabels original issue as `llemy-planned`
   - Continues to next issue

**Output:**
- All output logged to `.llemy/logs/plan.log`
- Plan files: `.llemy/plan/`
- Todo files: `.llemy/todo/`

**Requirements:**
- `gh` CLI authenticated
- Run from inside the target GitHub repo (or set `LLEMY_REPO=owner/name`)
- Claude Code running in VSCode

**Note:** For fully hands-off automation, set `ANTHROPIC_API_KEY` in `.llemy/.env` and use `scripts/process-plan-issues_api.js` (requires API credits).

---

### Implementation Workflow (llemy-todo → llemy-done)

Process GitHub issues labeled `llemy-todo` and implement them using Codex.

**Steps:**

1. **Start the script in a Codex session:**
   ```run
   node scripts/llemy-do.js
   ```

2. **The script will:**
   - Scan repos for `llemy-todo` issues
   - Fetch each issue and create a todo file: `.llemy/todo/<repo>_<issue>_todo.md`
   - **PAUSE** and print an instruction like:
     ```
     [repo#123] ⏸️  Paused - run this in Codex to continue:
     [repo#123]    "Implement this plan: [todo file content]"
     ```

3. **In Codex, send the printed instruction:**
   - Copy the instruction from the terminal
   - Paste it into Codex chat
   - Codex implements the code according to the plan

4. **Script auto-resumes:**
   - Detects the completion comment on the issue
   - Verifies `llemy-done` label is applied
   - Continues to next issue

**Output:**
- All output logged to `.llemy/logs/do.log`
- Todo files: `.llemy/todo/`

**Requirements:**
- `gh` CLI authenticated
- Run from inside the target GitHub repo (or set `LLEMY_REPO=owner/name`)
- Codex running and ready to implement

**Note:** Codex should follow the workflow instructions in each todo file to create branch, implement, commit, push, and label the issue.
