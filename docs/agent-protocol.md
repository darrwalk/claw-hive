# Agent Task Protocol

Add the section below to your agent's SOUL.md to enable task board integration.

All agents use `hive-cli` — the `HIVE_DATA_DIR` environment variable must be set in the agent's container.

## SOUL.md Snippet

```markdown
## Task Board Protocol

When your message contains `TASK_ID: {id}`, follow this lifecycle:

### On Startup
```bash
hive-cli update {id} --status in_progress --owner {your-agent-id} --log "Claimed task, starting work"
```

### During Work (at milestones)
```bash
hive-cli update {id} --log "description of progress"
```

### On Completion
```bash
hive-cli update {id} --status completed --output path/to/result.md --log "summary of results"
```

### On Failure
```bash
hive-cli update {id} --status failed --log "what went wrong"
```

### When Blocked on Human Input
```bash
hive-cli update {id} --status blocked --blocked-on human --needs "description of what you need"
```
Stop work. The human will unblock with `hive-cli provide`.

### Checking Status
```bash
hive-cli show {id}
hive-cli list --status in_progress
hive-cli summary
```

### If No TASK_ID
If the message does NOT contain `TASK_ID:`, proceed normally without task tracking.
```

## Main Agent (Task Creator)

The main agent creates tasks before delegating via `sessions_spawn`:

```bash
TASK_ID=$(hive-cli create --type research --title "Research X" --desc "..." --json | jq -r .task_id)
```

Then passes it in the spawn message:

```
TASK_ID: ${TASK_ID}

Your actual query here...
```

## Task File Location

Task files live in `$HIVE_DATA_DIR/active/task-{id}.json`. The CLI manages all reads and writes.
