# Agent Task Protocol

Add the relevant section below to your agent's SOUL.md to enable task board integration.

## For Agents with read/write Only (e.g., research-agent)

```markdown
## Task Board Protocol

When your message contains `TASK_ID: {id}`, follow this lifecycle:

### On Startup
1. `read` the file at `~/clawd/hive-data/active/task-{id}.json`
2. Update: set `status` to `"in_progress"`, `owner` to your agent ID, `claimed_at` to current ISO timestamp
3. Append to `log`: `{ts, event: "claimed", agent: "{your-id}", detail: "Claimed task, starting work"}`
4. `write` the updated JSON back to the same path

### During Work
Periodically (every ~10 minutes or at major milestones):
1. `read` the task file
2. Append to `log`: `{ts, event: "progress", agent: "{your-id}", detail: "description of progress"}`
3. `write` back

### On Completion
1. `read` the task file
2. Update: set `status` to `"completed"`, `completed_at` to current ISO timestamp, `output_path` to your output file's relative path
3. Append to `log`: `{ts, event: "completed", agent: "{your-id}", detail: "summary of results"}`
4. `write` back

### On Failure
1. `read` the task file
2. Update: set `status` to `"failed"`, `completed_at` to current ISO timestamp
3. Append to `log`: `{ts, event: "failed", agent: "{your-id}", detail: "what went wrong"}`
4. `write` back

### When Blocked on Human Input
1. `read` the task file
2. Update: set `status` to `"blocked"`, `blocked_on` to `"human"`, `human_input` to `{needed: "description of what you need", provided: null}`
3. Append to `log`: `{ts, event: "blocked", agent: "{your-id}", detail: "Waiting for human: description"}`
4. `write` back
5. Stop work — the watchdog will notify the human and the task will be unblocked via `hive-cli provide`

### Handoff to Next Agent
When your task is part of a project and the next task should start:
1. `read` the next task file from `~/clawd/hive-data/active/task-{next-id}.json`
2. The next agent will be spawned separately — just ensure your output is written and your task is marked `completed`
```

## For Agents with bash (e.g., dev-agent, main agent)

```markdown
## Task Board Protocol

Use `hive-cli` for all task operations:

### Creating Tasks (main agent)
Before delegating via `sessions_spawn`, create a task:
```bash
TASK_ID=$(hive-cli create --type research --title "Research X" --desc "..." --json | jq -r .task_id)
```
Then pass it in the spawn message:
```
TASK_ID: ${TASK_ID}

Your actual query here...
```

### Updating Tasks
```bash
hive-cli update {task-id} --status in_progress
hive-cli update {task-id} --status completed --output path/to/output.md
hive-cli update {task-id} --status blocked --blocked-on human --needs "Need API key"
```

### Checking Status
```bash
hive-cli list --status in_progress
hive-cli show {task-id}
hive-cli summary
```

### Providing Human Input
```bash
hive-cli provide {task-id} --input "the requested information"
```
```

## Task File Location

All task files live in: `~/clawd/hive-data/active/task-{id}.json`

The `~/clawd/` prefix maps to `/home/openclaw/workspace/` on the host via Docker volume mount.
