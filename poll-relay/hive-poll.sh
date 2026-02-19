#!/usr/bin/env bash
# Container-level hive poller — spawns agent session only when pending tasks exist
# Usage: hive-poll.sh <agent-type> <agent-id> <timeout>
# Example: hive-poll.sh research research 1800

set -euo pipefail

AGENT_TYPE="${1:?Usage: hive-poll.sh <agent-type> <agent-id> <timeout>}"
AGENT_ID="${2:?Usage: hive-poll.sh <agent-type> <agent-id> <timeout>}"
TIMEOUT="${3:?Usage: hive-poll.sh <agent-type> <agent-id> <timeout>}"

HIVE_CLI="${HIVE_CLI:?HIVE_CLI env var required}"
HIVE_CLI_DIR="$(dirname "$HIVE_CLI")"
HIVE_DATA="${HIVE_DATA_DIR:?HIVE_DATA_DIR env var required}"
GATEWAY_CONTAINER="${GATEWAY_CONTAINER:-openclaw-gateway-1}"
LOCK="/tmp/hive-poll-${AGENT_TYPE}.lock"

# Skip if agent already running
if [ -f "$LOCK" ]; then
  LOCK_PID=$(cat "$LOCK" 2>/dev/null || true)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0
  fi
  rm -f "$LOCK"
fi

# Check for unblocked pending tasks of this type
COUNT=$(HIVE_DATA_DIR="$HIVE_DATA" node "$HIVE_CLI" list --status pending --json 2>/dev/null \
  | node --input-type=module -e "
    import { filterReadyTasks } from '${HIVE_CLI_DIR}/lib/poll-utils.js';
    import { readFileSync } from 'fs';
    const tasks = JSON.parse(readFileSync('/dev/stdin','utf8'));
    const readTask = id => { try { return JSON.parse(readFileSync('${HIVE_DATA}/active/task-' + id + '.json','utf8')); } catch { return null; } };
    console.log(filterReadyTasks(tasks, '${AGENT_TYPE}', readTask).length);
  " 2>/dev/null || echo "0")

[ "$COUNT" -gt 0 ] || exit 0

# Lock with PID, spawn, unlock
echo $$ > "$LOCK"
trap "rm -f $LOCK" EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Found $COUNT pending $AGENT_TYPE task(s), spawning $AGENT_ID session..."

docker exec "$GATEWAY_CONTAINER" npx openclaw agent \
  --agent "$AGENT_ID" \
  --message "POLL_MODE: Check hive for pending ${AGENT_TYPE} tasks and execute." \
  --timeout "$TIMEOUT" 2>&1 || true

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $AGENT_ID session completed."
