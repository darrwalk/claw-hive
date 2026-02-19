#!/usr/bin/env bash
# Hive completed-task relay — announces completed tasks to Claw-Hive topic
# Runs every 15 minutes via cron

set -euo pipefail

HIVE_CLI="${HIVE_CLI:?HIVE_CLI env var required}"
HIVE_DATA="${HIVE_DATA_DIR:?HIVE_DATA_DIR env var required}"
BOT_TOKEN="${BOT_TOKEN:?BOT_TOKEN env var required}"
CHAT_ID="${CHAT_ID:?CHAT_ID env var required}"
THREAD_ID="${THREAD_ID:?THREAD_ID env var required}"
LOCK="/tmp/hive-relay.lock"

# Skip if relay already running
if [ -f "$LOCK" ]; then
  LOCK_PID=$(cat "$LOCK" 2>/dev/null || true)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0
  fi
  rm -f "$LOCK"
fi

# Find completed tasks needing announcement
TASK_IDS=$(HIVE_DATA_DIR="$HIVE_DATA" node "$HIVE_CLI" list --status completed --json 2>/dev/null \
  | node -e "
    const tasks = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const needing = tasks.filter(t => {
      if (!t.log || t.log.length === 0) return true;
      const lastAnnounce = [...t.log].reverse().find(l => l.detail && l.detail.includes('Announced to Claw-Hive'));
      if (!lastAnnounce) return true;
      const lastComplete = [...t.log].reverse().find(l => l.event === 'completed');
      if (!lastComplete) return false;
      return new Date(lastComplete.ts) > new Date(lastAnnounce.ts);
    });
    console.log(needing.map(t => t.task_id).join(' '));
  " 2>/dev/null || echo "")

[ -n "$TASK_IDS" ] || exit 0

COUNT=$(echo "$TASK_IDS" | wc -w | tr -d ' ')

echo $$ > "$LOCK"
trap "rm -f $LOCK" EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Found $COUNT unannounced completed task(s): $TASK_IDS"

for TASK_ID in $TASK_IDS; do
  TASK_JSON=$(HIVE_DATA_DIR="$HIVE_DATA" node "$HIVE_CLI" show "$TASK_ID" --json 2>/dev/null || echo "{}")

  TITLE=$(echo "$TASK_JSON" | node -e "const t=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(t.title || 'Untitled')" 2>/dev/null)
  OWNER=$(echo "$TASK_JSON" | node -e "const t=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(t.owner || 'unassigned')" 2>/dev/null)
  OUTPUT=$(echo "$TASK_JSON" | node -e "const t=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(t.output_path || '(inline)')" 2>/dev/null)

  MSG=$(printf '✅ Task completed — #%s\n\n%s\nAgent: %s\nOutput: %s\n\n📋 http://100.99.29.88:4100/tasks/%s' "$TASK_ID" "$TITLE" "$OWNER" "$OUTPUT" "$TASK_ID")

  RESULT=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "message_thread_id=${THREAD_ID}" \
    --data-urlencode "text=${MSG}" 2>/dev/null)

  OK=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.ok ? 'true' : 'false')" 2>/dev/null)

  if [ "$OK" = "true" ]; then
    HIVE_DATA_DIR="$HIVE_DATA" node "$HIVE_CLI" update "$TASK_ID" --log "Announced to Claw-Hive" 2>/dev/null
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Announced completed task $TASK_ID"
  else
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Failed to announce $TASK_ID: $RESULT"
  fi
done

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Completed relay finished."
