# claw-hive Task & Project Schema

## Task Files

Location: `hive-data/active/task-{id}.json`

### Task ID Format

`YYYYMMDD-HHMMSS-XXXX` where XXXX is 4 random hex characters.

Example: `20260215-143022-a7f3`

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | yes | Unique ID (matches filename) |
| `title` | string | yes | Short task title |
| `description` | string | yes | Full task description |
| `type` | string | yes | `research`, `dev`, or custom type |
| `status` | string | yes | `pending`, `in_progress`, `completed`, `failed`, `blocked` |
| `owner` | string\|null | no | Agent ID that claimed this task |
| `project_id` | string\|null | no | Parent project ID |
| `depends_on` | string[] | no | Task IDs that must complete first |
| `output_path` | string\|null | no | Relative path to agent's output file |
| `deadline_minutes` | number | no | Timeout in minutes (0 = no deadline) |
| `blocked_on` | string\|null | no | `"human"`, `"task-{id}"`, or null |
| `human_input` | object\|null | no | `{needed: string, provided: string\|null}` |
| `created_at` | string | yes | ISO 8601 timestamp |
| `claimed_at` | string\|null | no | When agent started work |
| `completed_at` | string\|null | no | When task finished |
| `log` | array | yes | Append-only log entries |

### Status Transitions

```
pending → in_progress → completed
                      → failed
                      → blocked → in_progress (after unblock)
```

### Log Entries

Each entry in the `log` array:

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp |
| `event` | string | `created`, `claimed`, `progress`, `completed`, `failed`, `blocked`, `unblocked`, `timeout` |
| `agent` | string\|null | Agent ID or `hive-cli` or `watchdog` |
| `detail` | string | Human-readable description |

### Default Deadlines by Type

| Type | Default `deadline_minutes` |
|------|---------------------------|
| `research` | 30 |
| `dev` | 0 (no deadline) |
| custom | 0 (no deadline) |

## Project Files

Location: `hive-data/projects/project-{id}.json`

### Project ID Format

Same as task ID: `YYYYMMDD-HHMMSS-XXXX`

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | yes | Unique project ID |
| `title` | string | yes | Project title |
| `description` | string | no | Project description |
| `tasks` | array | yes | Ordered list of `{task_id, title, type}` |
| `created_at` | string | yes | ISO 8601 timestamp |
| `status` | string | yes | `active`, `completed`, `failed` |

Project status is derived: `completed` when all tasks are completed, `failed` if any task fails, `active` otherwise.

## SQLite Index

The watchdog rebuilds `hive.db` from all JSON files. Schema:

```sql
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT,
  status TEXT,
  owner TEXT,
  project_id TEXT,
  created_at TEXT,
  claimed_at TEXT,
  completed_at TEXT,
  deadline_minutes INTEGER,
  blocked_on TEXT
);

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT,
  created_at TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_project ON tasks(project_id);
```
