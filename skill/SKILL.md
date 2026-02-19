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
