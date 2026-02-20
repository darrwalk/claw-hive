---
name: hive
description: Task board for agent coordination via hive-cli
---

# claw-hive Task Board

CLI: `/home/node/clawd/bin/hive-cli`

## Polling for Tasks (agents)

On wakeup with POLL_MODE in your message:
1. Check: `hive-cli list --status pending --json`
2. Parse JSON, find first task matching your type (research/dev) with no owner
3. No tasks? → Reply "No pending tasks" and stop
4. Found task? → Claim it:
   `hive-cli update {task_id} --status in_progress --owner {your-agent-id} --log "Claimed via polling"`
5. Use task title + description as your work input

## Updating Progress

At each major checkpoint:
`hive-cli update {task_id} --log "Step N: description"`

### Long-Running Tasks (polling, waiting for replies)

If your task involves waiting for an external event (email reply, API callback, approval),
send periodic heartbeat logs to prevent the stale task reaper from resetting your task:

`hive-cli update {task_id} --log "heartbeat: waiting for email reply (attempt N)"`

The reaper checks the most recent log entry — as long as you log within the threshold
(default 60min), your task stays alive. If your agent crashes, logs stop, and the
reaper correctly reclaims the task.

## Completing a Task

`hive-cli update {task_id} --status completed --output "Your result summary" --log "Done: summary"`
Optionally attach metadata: `--meta "key=value"` (repeatable). To remove a key: `--meta "key="`

The output text is stored alongside the task and rendered in the dashboard.

## Failing a Task

`hive-cli update {task_id} --status failed --log "What went wrong"`

## Blocking on Human Input

`hive-cli update {task_id} --status blocked --blocked-on human --needs "what you need"`

## Creating Tasks

### Research tasks
`hive-cli create --type research --title "TITLE" --desc "DESCRIPTION" --json`

### Dev tasks
`hive-cli create --type dev --title "TITLE" --desc "DESCRIPTION" --json`

### Main agent tasks (from specialist agents)
`hive-cli create --type main --title "TITLE" --desc "DESCRIPTION" --json`


## Task Routing (main agent)

Before responding to ANY user message, check if it should be delegated:

### Research tasks → `--type research`
**Triggers:** "research", "investigate", "analyze", "look into", "deep dive", "compare options", "find alternatives"
**AND** estimated effort >5 minutes (multiple web searches, source comparison, synthesis)

→ `exec`: `/home/node/clawd/bin/hive-cli create --type research --title "TITLE" --desc "USER_QUERY" --json`
→ Reply: "Queued for research. The specialist checks every 15 minutes."
→ STOP. Do not answer the question yourself.

**Skip delegation (handle inline):** "What's the weather?", "Summarize this article", memory lookups

### Dev tasks → `--type dev`
**Triggers:** "fix bug", "add feature", "refactor", "write code", "implement", "build", "test", "debug"
**AND** involves code creation, execution, or file modification

→ `exec`: `/home/node/clawd/bin/hive-cli create --type dev --title "TITLE" --desc "TASK_DESCRIPTION" --json`
→ Reply: "Queued for dev. The specialist checks every 15 minutes."
→ STOP. Do not write code yourself.

**Skip delegation (handle inline):** "Review this code snippet", "Explain how this works"

### Type reference
| Type | Who picks it up | Use for |
|------|----------------|---------|
| `research` | research-agent (Justin) | Web research, analysis, source comparison |
| `dev` | dev-agent (Linus) | Code creation, bug fixes, implementation |
| `ops` | main agent only | Housekeeping, scheduling — NEVER for research or dev |
| `main` | main agent | Specialist agents escalating back |

### Anti-patterns (NEVER do these)
- NEVER use `--type ops` for research or dev tasks
- NEVER answer research questions inline — your answers lack web sources, citations, verification
- NEVER claim tasks you created — let the specialist agent pick them up
- NEVER write code inline when dev-agent is available
## Checking Status

```bash
hive-cli list                    # all tasks
hive-cli list --status pending   # pending only
hive-cli show {task_id}          # single task detail
hive-cli summary                 # counts by status
```

## Workspace Browser

Browse and read files in the agent workspace without shell escaping issues. All paths are relative to the workspace root.

### List a directory

```bash
hive-cli workspace ls                    # workspace root
hive-cli workspace ls skills             # subdirectory
hive-cli workspace ls --json             # JSON output for parsing
hive-cli workspace ls --all              # include hidden files (dotfiles)
hive-cli workspace ls skills --json      # combine flags
```

Default output: one line per entry, `d`/`f` prefix indicates directory/file. Sorted: directories first, then alphabetical.

JSON output: array of `{ name, type, size, modified }` objects.

### Read a file

```bash
hive-cli workspace cat IDENTITY.md
hive-cli workspace cat memory/$(date +%Y-%m-%d).md
hive-cli workspace cat skills/hive/SKILL.md
```

- Text files print to stdout
- Binary files are rejected with an error
- Files over 100KB are truncated with a warning

### Common patterns

```bash
# Find all skill directories
hive-cli workspace ls skills --json | jq '.[].name'

# Check if a file exists (exit code 0 = exists)
hive-cli workspace cat some/file.md > /dev/null 2>&1 && echo "exists"

# Read today's memory
hive-cli workspace cat "memory/$(date +%Y-%m-%d).md"
```

## Chaining Tasks (Multi-Step)

When a request involves sequential steps (e.g., research then implement), create all sub-tasks upfront with dependency chaining and link them to the parent ops task:

```bash
# Step 1: Create first sub-task linked to parent ops task
TASK1=$(hive-cli create --type research --title "Research X" --desc "..." \
  --project "$PROJECT_ID" --parent-task "$OPS_TASK_ID" --json | jq -r '.task_id')
# Step 2: Create dependent sub-task, same parent
hive-cli create --type dev --title "Implement X based on research" --desc "..." \
  --project "$PROJECT_ID" --depends-on "$TASK1" --parent-task "$OPS_TASK_ID"
```

The CLI enforces parent task lifecycle automatically:
- Parent tasks cannot be marked `completed` while children are incomplete
- Parent tasks auto-complete when their last child finishes

The poll system will hold dependent tasks until their dependencies complete.

## Autonomous Task Chaining (Depth-Aware)

Agents running inside a hive task (depth 0) may create sub-tasks and wait for their results — without human handoffs. This section documents the complete protocol.

### Rules

- Only depth-0 agents (tasks created by a human) may create sub-tasks
- Pass `--depth 1` when creating a sub-task from inside a running task
- The CLI rejects `--depth 2` or higher — sub-tasks cannot create further sub-tasks
- If a sub-task's dependency fails, the `resolve-waiting` cron will automatically fail the waiting task

### Creating and Waiting for a Sub-Task

```bash
DEP_ID=$(hive-cli create \
  --type research \
  --title "Investigate X" \
  --desc "..." \
  --depth 1 \
  --json | jq -r '.task_id')

hive-cli wait "$DEP_ID" --timeout 1800
EXIT=$?

if [ $EXIT -eq 0 ]; then
  hive-cli update "$MY_TASK_ID" --status completed --log "Research done"
else
  hive-cli update "$MY_TASK_ID" --status failed --log "Sub-task failed: $DEP_ID"
fi
```

### Wait Command Reference

`hive-cli wait <task-id>` — blocks until the task reaches a terminal state (completed, failed, or abandoned)

| Option | Default | Description |
|--------|---------|-------------|
| `--timeout <seconds>` | 0 (unlimited) | Max wait time; exits 1 if exceeded |
| `--interval <seconds>` | 5 | Starting poll interval (doubles each tick) |
| `--max-interval <seconds>` | 30 | Maximum backoff interval |

**Exit codes:**
- `0` — task completed successfully
- `1` — task failed, abandoned, or timed out

### Anti-Patterns

- **NEVER** call `hive-cli create` without `--depth 1` from inside a task — this creates a depth-0 task, bypassing the sub-task intent
- **NEVER** ignore the exit code of `hive-cli wait` — a failed sub-task must propagate failure up the chain
- **NEVER** create sub-tasks from a depth-1 agent — the CLI enforces this with a hard rejection
- **NEVER** use `hive-cli wait` on a task type that has no agent polling for it — the wait will time out

## Human Input — Channel-Aware Behavior

How you ask for human input depends on whether you are in kanban mode or conversational mode.

### ⚠️ CRITICAL: External Actions Require Blocking

When your task involves sending emails, making calls, posting publicly, or any external action that needs human approval:
- In **kanban mode**: You MUST use `hive-cli update {id} --status blocked --blocked-on human --needs "Approve: [describe action]"` BEFORE acting. Text output like "Ready to send?" is NOT visible to anyone — the session will expire and your work is lost.
- In **conversational mode**: Ask directly in your reply.

### Conversational Mode (no TASK_ID in your message)

You were triggered by a direct message (e.g., Telegram). There is NO hive task.

- If you need clarification, state your question clearly in your reply
- Do NOT create hive tasks unless the human explicitly asks to track the work
- Do NOT use hive-cli blocking — just ask and wait for the next message
- The human will respond conversationally

### Kanban Mode (TASK_ID present in your message)

You were triggered by a hive task (dashboard, polling, or delegation). Everything goes through hive.

- If you need clarification, block the task:
  `hive-cli update {id} --status blocked --blocked-on human --needs "your specific question"`
- Stop work immediately after blocking
- The human will respond via the dashboard with `hive-cli provide`
- Do NOT reply conversationally — the dashboard is the interface

### When to Ask for Human Input (both modes)

Request input when:
- The query is ambiguous (multiple valid interpretations)
- You cannot find enough information to proceed (< 2 sources for research, missing specs for dev)
- The scope is too broad to complete within your limits
- A resource requires access you do not have
- A decision has significant consequences and could go multiple ways

Do NOT ask when:
- You can make a reasonable default choice
- The question is answerable from context already provided
- It is a minor detail that does not change the outcome
