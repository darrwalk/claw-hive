#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VOICE_DIR="$REPO_ROOT/claw-voice"
ENV_FILE="$REPO_ROOT/.env"

# =============================================================================
# Section 1: .env validation
# =============================================================================
echo "==> Validating .env..."

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

MISSING=()
[[ -z "${WORKSPACE_DIR:-}" ]] && MISSING+=(WORKSPACE_DIR)

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing required variables in $ENV_FILE:"
  for var in "${MISSING[@]}"; do
    echo "       - $var"
  done
  exit 1
fi

echo "    .env validated OK"

# =============================================================================
# Section 2: Deploy voice skill to workspace
# =============================================================================
echo "==> Deploying voice skill..."
mkdir -p "$WORKSPACE_DIR/skills/voice"
cp "$VOICE_DIR/skill/SKILL.md" "$WORKSPACE_DIR/skills/voice/SKILL.md"
cp "$VOICE_DIR/skill/tools.json" "$WORKSPACE_DIR/skills/voice/tools.json"
echo "    Skill deployed to $WORKSPACE_DIR/skills/voice/"

# =============================================================================
# Section 3: Docker build and start
# =============================================================================
echo "==> Building claw-voice..."
docker compose -f "$REPO_ROOT/docker-compose.yml" build claw-voice

echo "==> Starting claw-voice..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d claw-voice

# =============================================================================
# Section 4: Verify
# =============================================================================
echo "==> Waiting for health check..."
sleep 3
if curl -sf http://localhost:4200/health > /dev/null 2>&1; then
  echo "    claw-voice is healthy"
else
  echo "    WARNING: Health check failed — check logs with: docker compose logs claw-voice"
fi

echo ""
echo "==> Install complete."
echo "    Voice UI: http://100.99.29.88:4200/"
echo "    Widget:   http://100.99.29.88:4200/dist/claw-voice.js"
echo "    WebSocket: ws://100.99.29.88:4200/ws?provider=grok"
