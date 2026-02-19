#!/usr/bin/env bash
set -euo pipefail

# Resolve paths from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# =============================================================================
# Section 1: .env validation (fail-fast)
# =============================================================================
echo "==> Validating .env..."

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$REPO_ROOT/env.example" ]]; then
    cp "$REPO_ROOT/env.example" "$ENV_FILE"
    echo "ERROR: .env was missing — copied env.example to .env"
    echo "       Please fill in all required values in $ENV_FILE and re-run."
  else
    echo "ERROR: .env not found at $ENV_FILE and no env.example to copy from."
  fi
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

MISSING=()
[[ -z "${HIVE_DATA_DIR:-}" ]]         && MISSING+=(HIVE_DATA_DIR)
[[ -z "${DOCKER_GID:-}" ]]            && MISSING+=(DOCKER_GID)
[[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]    && MISSING+=(TELEGRAM_BOT_TOKEN)
[[ -z "${TELEGRAM_CHAT_ID:-}" ]]      && MISSING+=(TELEGRAM_CHAT_ID)
[[ -z "${TELEGRAM_THREAD_ID:-}" ]]    && MISSING+=(TELEGRAM_THREAD_ID)
[[ -z "${WORKSPACE_DIR:-}" ]]         && MISSING+=(WORKSPACE_DIR)

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: The following required variables are missing or empty in $ENV_FILE:"
  for var in "${MISSING[@]}"; do
    echo "       - $var"
  done
  exit 1
fi

echo "    .env validated OK"

# =============================================================================
# Section 2: Data directories (idempotent)
# =============================================================================
echo "==> Creating data directories..."
mkdir -p "$HIVE_DATA_DIR"/{active,archive,projects}
echo "    $HIVE_DATA_DIR/{active,archive,projects} ready"

# =============================================================================
# Section 3: CLI dependencies
# =============================================================================
echo "==> Installing CLI dependencies..."
cd "$REPO_ROOT/cli" && npm install --omit=dev
echo "    CLI dependencies installed"

# =============================================================================
# Section 4: CLI symlink (idempotent)
# =============================================================================
echo "==> Symlinking hive-cli..."
ln -sf "$REPO_ROOT/cli/hive-cli.js" /usr/local/bin/hive-cli
echo "    /usr/local/bin/hive-cli -> $REPO_ROOT/cli/hive-cli.js"

# =============================================================================
# Section 5: Skill deployment (idempotent: cp overwrites)
# =============================================================================
echo "==> Deploying hive skill..."
mkdir -p "$WORKSPACE_DIR/skills/hive"
cp "$REPO_ROOT/skill/SKILL.md" "$WORKSPACE_DIR/skills/hive/SKILL.md"
echo "    Skill deployed to $WORKSPACE_DIR/skills/hive/SKILL.md"
echo "    Remember to commit workspace changes:"
echo "      cd $WORKSPACE_DIR && git add skills/hive/SKILL.md && git commit -m 'deploy: update hive skill'"

# =============================================================================
# Section 6: Docker build and start
# =============================================================================
echo "==> Building Docker images..."
docker compose -f "$REPO_ROOT/docker-compose.yml" build

echo "==> Starting services..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d

# =============================================================================
# Section 7: Remove host crontab entries (idempotent)
# =============================================================================
echo "==> Cleaning up host crontab..."
if crontab -l 2>/dev/null | grep -qE 'hive-poll|hive-relay|hive-blocked-relay'; then
  TMPFILE=$(mktemp)
  crontab -l 2>/dev/null | grep -vE 'hive-poll|hive-relay|hive-blocked-relay' > "$TMPFILE" || true
  crontab "$TMPFILE"
  rm -f "$TMPFILE"
  echo "    Removed hive-* entries from host crontab"
else
  echo "    No hive-* crontab entries found (already clean)"
fi

# =============================================================================
# Section 8: Remove orphaned host scripts (idempotent)
# =============================================================================
echo "==> Removing orphaned host scripts..."
rm -f /home/openclaw/hive-poll.sh /home/openclaw/hive-relay.sh /home/openclaw/hive-blocked-relay.sh
echo "    Orphaned scripts removed (or were already absent)"

# =============================================================================
# Section 9: Done
# =============================================================================
echo ""
echo "==> Install complete. Services: dashboard, poll-relay"
echo "    Run 'docker compose -f $REPO_ROOT/docker-compose.yml ps' to verify services are running"
