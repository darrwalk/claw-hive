#!/usr/bin/env bash
# claw-hive watchdog — run via cron every 5 minutes
# Handles: stuck task detection, Telegram alerts, archival, SQLite rebuild
set -euo pipefail

HIVE_DATA_DIR="${HIVE_DATA_DIR:-/home/openclaw/workspace/hive-data}"
ACTIVE_DIR="$HIVE_DATA_DIR/active"
ARCHIVE_DIR="$HIVE_DATA_DIR/archive"
PROJECTS_DIR="$HIVE_DATA_DIR/projects"
DB_PATH="${HIVE_DB:-$HIVE_DATA_DIR/hive.db}"
LOG="/tmp/hive-watchdog.log"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

# Ensure directories exist
mkdir -p "$ACTIVE_DIR" "$ARCHIVE_DIR" "$PROJECTS_DIR"

log "Watchdog run started"

# --- 1. Stuck task detection (deadline exceeded) ---

now_epoch=$(date +%s)

for task_file in "$ACTIVE_DIR"/task-*.json; do
  [ -f "$task_file" ] || continue

  status=$(jq -r '.status' "$task_file")
  [ "$status" = "in_progress" ] || continue

  deadline=$(jq -r '.deadline_minutes // 0' "$task_file")
  [ "$deadline" -gt 0 ] || continue

  claimed_at=$(jq -r '.claimed_at // empty' "$task_file")
  [ -n "$claimed_at" ] || continue

  claimed_epoch=$(date -d "$claimed_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${claimed_at%%.*}" +%s 2>/dev/null || echo 0)
  [ "$claimed_epoch" -gt 0 ] || continue

  elapsed_min=$(( (now_epoch - claimed_epoch) / 60 ))

  if [ "$elapsed_min" -ge "$deadline" ]; then
    task_id=$(jq -r '.task_id' "$task_file")
    log "TIMEOUT: task $task_id exceeded ${deadline}min deadline (${elapsed_min}min elapsed)"

    # Update task status to failed
    jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.status = "failed" |
        .completed_at = $ts |
        .log += [{"ts": $ts, "event": "timeout", "agent": "watchdog", "detail": "Deadline exceeded, marked as failed"}]' \
       "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
  fi
done

# --- 2. Telegram alerts for blocked tasks ---

send_telegram() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="$TELEGRAM_CHAT_ID" \
      -d text="$message" \
      -d parse_mode="Markdown" > /dev/null 2>&1 || true
  fi
}

for task_file in "$ACTIVE_DIR"/task-*.json; do
  [ -f "$task_file" ] || continue

  status=$(jq -r '.status' "$task_file")
  [ "$status" = "blocked" ] || continue

  blocked_on=$(jq -r '.blocked_on // empty' "$task_file")
  [ "$blocked_on" = "human" ] || continue

  # Check if we already notified (look for "notified" in log)
  already_notified=$(jq '[.log[] | select(.event == "notified")] | length' "$task_file")
  [ "$already_notified" -eq 0 ] || continue

  task_id=$(jq -r '.task_id' "$task_file")
  title=$(jq -r '.title' "$task_file")
  needed=$(jq -r '.human_input.needed // "unknown"' "$task_file")

  log "ALERT: task $task_id blocked on human input: $needed"
  send_telegram "🐝 *claw-hive*: Task blocked on you\n\n*${title}*\nNeeds: ${needed}\n\nUnblock: \`hive-cli provide ${task_id} --input \"...\"\`"

  # Mark as notified
  jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '.log += [{"ts": $ts, "event": "notified", "agent": "watchdog", "detail": "Telegram notification sent"}]' \
     "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
done

# --- 3. Archive old completed/failed tasks (>24h) ---

archive_cutoff=$(( now_epoch - 86400 ))

for task_file in "$ACTIVE_DIR"/task-*.json; do
  [ -f "$task_file" ] || continue

  status=$(jq -r '.status' "$task_file")
  [ "$status" = "completed" ] || [ "$status" = "failed" ] || continue

  completed_at=$(jq -r '.completed_at // empty' "$task_file")
  [ -n "$completed_at" ] || continue

  completed_epoch=$(date -d "$completed_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${completed_at%%.*}" +%s 2>/dev/null || echo 0)
  [ "$completed_epoch" -gt 0 ] || continue

  if [ "$completed_epoch" -lt "$archive_cutoff" ]; then
    task_id=$(jq -r '.task_id' "$task_file")
    log "ARCHIVE: moving task $task_id to archive"
    mv "$task_file" "$ARCHIVE_DIR/"
  fi
done

# --- 4. Rebuild SQLite index ---

log "Rebuilding SQLite index"

rm -f "$DB_PATH"

sqlite3 "$DB_PATH" <<'SQL'
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
SQL

# Index active tasks
for task_file in "$ACTIVE_DIR"/task-*.json; do
  [ -f "$task_file" ] || continue
  jq -r '[.task_id, .title, .type, .status, .owner, .project_id, .created_at, .claimed_at, .completed_at, (.deadline_minutes|tostring), .blocked_on] | @tsv' "$task_file" | while IFS=$'\t' read -r tid title type status owner pid cat clat coat dl bon; do
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO tasks VALUES ('$(echo "$tid" | sed "s/'/''/g")', '$(echo "$title" | sed "s/'/''/g")', '$(echo "$type" | sed "s/'/''/g")', '$status', '$(echo "$owner" | sed "s/'/''/g")', '$(echo "$pid" | sed "s/'/''/g")', '$cat', '$clat', '$coat', $dl, '$(echo "$bon" | sed "s/'/''/g")');"
  done
done

# Index archived tasks
for task_file in "$ARCHIVE_DIR"/task-*.json; do
  [ -f "$task_file" ] || continue
  jq -r '[.task_id, .title, .type, .status, .owner, .project_id, .created_at, .claimed_at, .completed_at, (.deadline_minutes|tostring), .blocked_on] | @tsv' "$task_file" | while IFS=$'\t' read -r tid title type status owner pid cat clat coat dl bon; do
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO tasks VALUES ('$(echo "$tid" | sed "s/'/''/g")', '$(echo "$title" | sed "s/'/''/g")', '$(echo "$type" | sed "s/'/''/g")', '$status', '$(echo "$owner" | sed "s/'/''/g")', '$(echo "$pid" | sed "s/'/''/g")', '$cat', '$clat', '$coat', $dl, '$(echo "$bon" | sed "s/'/''/g")');"
  done
done

# Index projects
for proj_file in "$PROJECTS_DIR"/project-*.json; do
  [ -f "$proj_file" ] || continue
  jq -r '[.project_id, .title, .status, .created_at] | @tsv' "$proj_file" | while IFS=$'\t' read -r pid title status cat; do
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO projects VALUES ('$(echo "$pid" | sed "s/'/''/g")', '$(echo "$title" | sed "s/'/''/g")', '$status', '$cat');"
  done
done

task_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tasks;")
proj_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM projects;")
log "SQLite rebuilt: $task_count tasks, $proj_count projects"
log "Watchdog run completed"
