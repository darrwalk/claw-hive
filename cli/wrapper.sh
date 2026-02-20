#!/usr/bin/env bash
HIVE_DATA_DIR="${HIVE_DATA_DIR:-/home/node/clawd/hive-data}" \
WORKSPACE_PATH="${WORKSPACE_PATH:-/home/node/clawd}" \
exec node /home/node/clawd/hive/cli/hive-cli.js "$@"
