# claw-hive

Task management CLI for [OpenClaw](https://github.com/nichochar/openclaw) multi-agent systems.

All agents use `hive-cli` to create, claim, update, and complete tasks. JSON task files in a shared directory provide the persistent state.

## Architecture

```
hive-data/              (task storage - outside this repo)
├── active/             All live task JSON files
├── archive/            Old completed/failed tasks
└── projects/           Multi-step project definitions

claw-hive/              (this repo)
├── cli/                hive-cli tool
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

# Set data directory (add to shell profile)
export HIVE_DATA_DIR=/path/to/hive-data

# Create your first task
hive-cli create --type research --title "Research X" --desc "Investigate X topic"
```

## CLI Usage

```bash
hive-cli create --type research --title "Research X" --desc "..."
hive-cli list [--status in_progress] [--owner research-agent]
hive-cli show <task-id>
hive-cli update <task-id> --status in_progress --owner research-agent
hive-cli update <task-id> --status completed --output path/to/output.md
hive-cli update <task-id> --status blocked --blocked-on human --needs "GitHub PAT"
hive-cli provide <task-id> --input "ghp_xxxx..."
hive-cli project create --title "Build X" --tasks "research:Research X" "dev:Build prototype"
hive-cli summary
```

All commands output JSON with `--json` flag.

## Agent Integration

Add to your agent's SOUL.md — see `docs/agent-protocol.md` for the full snippet.

Agents use `hive-cli` directly:
1. On startup: `hive-cli update {task-id} --status in_progress --owner {agent-id}`
2. During work: `hive-cli update {task-id} --log "progress update"`
3. On completion: `hive-cli update {task-id} --status completed --output path/to/result.md`

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `HIVE_DATA_DIR` | `../hive-data` (relative to CLI) | Path to task data directory |

## License

MIT
