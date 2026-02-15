# claw-hive

Task management and coordination dashboard for [OpenClaw](https://github.com/nichochar/openclaw) multi-agent systems.

Agents interact with JSON task files via read/write. Humans use `hive-cli`. A watchdog handles timeouts and alerts. A dashboard provides visibility.

## Architecture

```
hive-data/              (task storage - outside this repo)
├── active/             All live task JSON files
├── archive/            Completed/failed tasks (moved by watchdog)
├── projects/           Multi-step project definitions
└── hive.db             SQLite index (auto-rebuilt)

claw-hive/              (this repo)
├── cli/                hive-cli tool
├── watchdog/           Cron script for timeouts, alerts, archival
├── dashboard/          Next.js Kanban board
├── schema/             Task/project format docs + examples
└── docs/               Agent protocol documentation
```

## Quick Start

```bash
# Clone into your OpenClaw workspace
cd /path/to/workspace
git clone git@github.com:darrwalk/claw-hive.git hive

# Create data directory
mkdir -p hive-data/{active,archive,projects}

# Install CLI dependencies
cd hive/cli && npm install

# Add CLI to path
ln -s $(pwd)/hive-cli.js /usr/local/bin/hive-cli

# Create your first task
hive-cli create --type research --title "Research X" --desc "Investigate X topic"
```

## CLI Usage

```bash
hive-cli create --type research --title "Research X" --desc "..."
hive-cli list [--status in_progress] [--owner research-agent]
hive-cli show <task-id>
hive-cli update <task-id> --status blocked --blocked-on human --needs "GitHub PAT"
hive-cli provide <task-id> --input "ghp_xxxx..."
hive-cli project create --title "Build X" --tasks "research:Research X" "dev:Build prototype"
hive-cli summary
```

## Dashboard

```bash
# Add to your docker-compose setup
docker compose -f docker-compose.yml up -d

# Access via SSH tunnel (if remote)
ssh -L 3000:127.0.0.1:3000 root@your-server
open http://localhost:3000
```

## Watchdog

```bash
# Add to crontab (every 5 minutes)
echo "*/5 * * * * /path/to/hive/watchdog/hive-watchdog.sh" | crontab -

# Optional: Telegram notifications
export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CHAT_ID="your-chat-id"
```

## Agent Integration

Copy the protocol snippet from `docs/agent-protocol.md` into your agent's SOUL.md.

Agents with only `read`/`write` tools interact directly with task JSON files.
Agents with `bash` can use `hive-cli` commands.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `HIVE_DATA_DIR` | `../hive-data` (relative to CLI) | Path to task data directory |
| `HIVE_DB` | `$HIVE_DATA_DIR/hive.db` | Path to SQLite index |
| `TELEGRAM_BOT_TOKEN` | (none) | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | (none) | Telegram chat ID for alerts |

## License

MIT
