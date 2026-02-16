#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { canComplete, shouldAutoCompleteParent } from './lib/lifecycle.js';
import { join, resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---

const DATA_DIR = resolve(process.env.HIVE_DATA_DIR || join(__dirname, '..', '..', 'hive-data'));
const ACTIVE_DIR = join(DATA_DIR, 'active');
const ARCHIVE_DIR = join(DATA_DIR, 'archive');
const PROJECTS_DIR = join(DATA_DIR, 'projects');

const DEFAULT_DEADLINES = { research: 30, dev: 0 };

// --- Helpers ---

function generateId() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const hex = randomBytes(2).toString('hex');
  return `${date}-${time}-${hex}`;
}

function now() {
  return new Date().toISOString();
}

function readTask(taskId) {
  const path = join(ACTIVE_DIR, `task-${taskId}.json`);
  if (!existsSync(path)) {
    const archivePath = join(ARCHIVE_DIR, `task-${taskId}.json`);
    if (existsSync(archivePath)) {
      return JSON.parse(readFileSync(archivePath, 'utf-8'));
    }
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeTask(task) {
  const path = join(ACTIVE_DIR, `task-${task.task_id}.json`);
  writeFileSync(path, JSON.stringify(task, null, 2) + '\n');
}

function readTaskSafe(taskId) {
  const path = join(ACTIVE_DIR, `task-${taskId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function listTaskFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith('task-') && f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
}

function ensureDirs() {
  for (const dir of [ACTIVE_DIR, ARCHIVE_DIR, PROJECTS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

// --- Commands ---

const program = new Command();
program.name('hive-cli').description('claw-hive task management CLI').version('0.1.0');

// create
program
  .command('create')
  .description('Create a new task')
  .requiredOption('--title <title>', 'Task title')
  .requiredOption('--desc <description>', 'Task description')
  .option('--type <type>', 'Task type (research, dev, custom)', 'research')
  .option('--project <id>', 'Link to project')
  .option('--depends-on <ids...>', 'Task IDs this depends on')
  .option('--deadline <minutes>', 'Deadline in minutes')
  .option('--parent-task <id>', 'Parent task ID (for sub-tasks)')
  .option('--meta <key=value...>', 'Set metadata key=value (repeatable)')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    ensureDirs();
    const taskId = generateId();
    const deadline = opts.deadline != null ? parseInt(opts.deadline) : (DEFAULT_DEADLINES[opts.type] ?? 0);

    const metadata = {};
    if (opts.meta) {
      for (const pair of opts.meta) {
        const eq = pair.indexOf('=');
        if (eq === -1) { console.error(`Invalid --meta format: "${pair}". Use key=value.`); process.exit(1); }
        metadata[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }

    const task = {
      task_id: taskId,
      title: opts.title,
      description: opts.desc,
      type: opts.type,
      status: 'pending',
      owner: null,
      project_id: opts.project || null,
      depends_on: opts.dependsOn || [],
      parent_task: opts.parentTask || null,
      output_path: null,
      metadata,
      deadline_minutes: deadline,
      blocked_on: null,
      human_input: null,
      created_at: now(),
      claimed_at: null,
      completed_at: null,
      log: [{
        ts: now(),
        event: 'created',
        agent: 'hive-cli',
        detail: `Task created: ${opts.title}`
      }]
    };

    writeTask(task);

    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log(`Created task: ${taskId}`);
      console.log(`  Title: ${opts.title}`);
      console.log(`  Type: ${opts.type}`);
      console.log(`  Deadline: ${deadline > 0 ? deadline + ' min' : 'none'}`);
      console.log(`  File: ${join(ACTIVE_DIR, `task-${taskId}.json`)}`);
    }
  });

// list
program
  .command('list')
  .description('List tasks')
  .option('--status <status>', 'Filter by status')
  .option('--owner <owner>', 'Filter by owner')
  .option('--project <id>', 'Filter by project')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    let tasks = listTaskFiles(ACTIVE_DIR);

    if (opts.status) tasks = tasks.filter(t => t.status === opts.status);
    if (opts.owner) tasks = tasks.filter(t => t.owner === opts.owner);
    if (opts.project) tasks = tasks.filter(t => t.project_id === opts.project);

    if (opts.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return;
    }

    if (tasks.length === 0) {
      console.log('No tasks found.');
      return;
    }

    const statusColors = {
      pending: '\x1b[33m',
      in_progress: '\x1b[36m',
      completed: '\x1b[32m',
      failed: '\x1b[31m',
      blocked: '\x1b[35m',
    };
    const reset = '\x1b[0m';

    for (const t of tasks) {
      const color = statusColors[t.status] || '';
      const owner = t.owner ? ` [${t.owner}]` : '';
      const blocked = t.blocked_on ? ` (blocked: ${t.blocked_on})` : '';
      console.log(`${color}${t.status.padEnd(12)}${reset} ${t.task_id}  ${t.title}${owner}${blocked}`);
    }
  });

// show
program
  .command('show <task-id>')
  .description('Show task details')
  .option('--json', 'Output as JSON')
  .action((taskId, opts) => {
    const task = readTask(taskId);

    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
      return;
    }

    console.log(`Task: ${task.task_id}`);
    console.log(`Title: ${task.title}`);
    console.log(`Description: ${task.description}`);
    console.log(`Type: ${task.type}`);
    console.log(`Status: ${task.status}`);
    console.log(`Owner: ${task.owner || '(none)'}`);
    console.log(`Project: ${task.project_id || '(none)'}`);
    console.log(`Deadline: ${task.deadline_minutes > 0 ? task.deadline_minutes + ' min' : 'none'}`);
    console.log(`Created: ${task.created_at}`);
    if (task.claimed_at) console.log(`Claimed: ${task.claimed_at}`);
    if (task.completed_at) console.log(`Completed: ${task.completed_at}`);
    if (task.output_path) console.log(`Output: ${task.output_path}`);
    if (task.blocked_on) console.log(`Blocked on: ${task.blocked_on}`);
    if (task.human_input?.needed) {
      console.log(`Needs: ${task.human_input.needed}`);
      if (task.human_input.provided) console.log(`Provided: ${task.human_input.provided}`);
    }
    if (task.depends_on?.length) console.log(`Depends on: ${task.depends_on.join(', ')}`);
    if (task.parent_task) console.log(`Parent: ${task.parent_task}`);

    const children = listTaskFiles(ACTIVE_DIR).filter(t => t.parent_task === task.task_id);
    if (children.length > 0) {
      console.log(`Children (${children.length}):`);
      for (const c of children) {
        console.log(`  ${c.task_id}  [${c.status}] ${c.title}`);
      }
    }

    if (task.metadata && Object.keys(task.metadata).length > 0) {
      console.log('Metadata:');
      for (const [k, v] of Object.entries(task.metadata)) {
        console.log(`  ${k}: ${v}`);
      }
    }

    console.log(`\nLog (${task.log.length} entries):`);
    for (const entry of task.log.slice(-10)) {
      const agent = entry.agent ? ` [${entry.agent}]` : '';
      console.log(`  ${entry.ts} ${entry.event}${agent}: ${entry.detail}`);
    }
  });

// update
program
  .command('update <task-id>')
  .description('Update a task')
  .option('--status <status>', 'New status')
  .option('--owner <owner>', 'Set owner')
  .option('--output <path>', 'Set output path')
  .option('--blocked-on <target>', 'Set blocked_on (human or task-{id})')
  .option('--needs <description>', 'Set human_input.needed')
  .option('--meta <key=value...>', 'Set metadata key=value (repeatable, empty value deletes key)')
  .option('--log <message>', 'Append log entry')
  .option('--json', 'Output as JSON')
  .action((taskId, opts) => {
    const task = readTask(taskId);
    if (!task.metadata) task.metadata = {};

    if (opts.status) {
      // Guard A: block premature parent completion
      if (opts.status === 'completed') {
        const allTasks = listTaskFiles(ACTIVE_DIR);
        const result = canComplete(taskId, allTasks);
        if (!result.allowed) {
          task.status = 'in_progress';
          task.completed_at = null;
          task.log.push({
            ts: now(), event: 'guard', agent: 'hive-cli',
            detail: `Completion blocked: ${result.incomplete}/${result.children} children still incomplete`
          });
          writeTask(task);
          console.log(`Completion blocked: ${result.incomplete} children still incomplete. Task stays in_progress.`);
          return;
        }
      }

      task.status = opts.status;
      if (opts.status === 'pending') {
        task.owner = null;
        task.claimed_at = null;
        task.completed_at = null;
        task.blocked_on = null;
      }
      if (opts.status === 'in_progress' && !task.claimed_at) {
        task.claimed_at = now();
      }
      if (opts.status === 'completed' || opts.status === 'failed') {
        task.completed_at = now();
      }
      if (opts.status === 'blocked' && opts.blockedOn) {
        task.blocked_on = opts.blockedOn;
      }
      if (opts.status === 'in_progress') {
        task.blocked_on = null;
      }
    }
    if (opts.owner) task.owner = opts.owner;
    if (opts.output) task.output_path = opts.output;
    if (opts.blockedOn) task.blocked_on = opts.blockedOn;
    if (opts.needs) {
      task.human_input = { needed: opts.needs, provided: null };
    }
    if (opts.meta) {
      for (const pair of opts.meta) {
        const eq = pair.indexOf('=');
        if (eq === -1) { console.error(`Invalid --meta format: "${pair}". Use key=value.`); process.exit(1); }
        const key = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        if (value === '') { delete task.metadata[key]; } else { task.metadata[key] = value; }
      }
    }

    const logEvent = opts.status || 'update';
    const logDetail = opts.log || `Updated: ${Object.keys(opts).filter(k => k !== 'json').join(', ')}`;
    task.log.push({
      ts: now(),
      event: logEvent,
      agent: 'hive-cli',
      detail: logDetail
    });

    writeTask(task);

    // Guard B: auto-complete parent when last child finishes
    if (opts.status === 'completed' && task.parent_task) {
      const allTasks = listTaskFiles(ACTIVE_DIR);
      const parentId = shouldAutoCompleteParent(task, allTasks);
      if (parentId) {
        const parent = readTaskSafe(parentId);
        if (parent && parent.status === 'in_progress') {
          parent.status = 'completed';
          parent.completed_at = now();
          parent.log.push({
            ts: now(), event: 'completed', agent: 'hive-cli',
            detail: `Auto-completed: all ${allTasks.filter(t => t.parent_task === parentId).length} children finished`
          });
          writeTask(parent);
          console.log(`Parent task ${parentId} auto-completed (all children done).`);
        }
      }
    }

    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log(`Updated task ${taskId}: status=${task.status}`);
    }
  });

// provide
program
  .command('provide <task-id>')
  .description('Provide human input to a blocked task')
  .requiredOption('--input <value>', 'The input to provide')
  .option('--json', 'Output as JSON')
  .action((taskId, opts) => {
    const task = readTask(taskId);

    if (task.status !== 'blocked') {
      console.error(`Task ${taskId} is not blocked (status: ${task.status})`);
      process.exit(1);
    }

    task.human_input = task.human_input || {};
    task.human_input.provided = opts.input;
    task.status = 'pending';
    task.blocked_on = null;

    task.log.push({
      ts: now(),
      event: 'unblocked',
      agent: 'hive-cli',
      detail: `Human input provided: ${opts.input.slice(0, 50)}${opts.input.length > 50 ? '...' : ''}`
    });

    writeTask(task);

    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log(`Unblocked task ${taskId} with provided input.`);
    }
  });

// project create
const projectCmd = program.command('project').description('Project operations');

projectCmd
  .command('create')
  .description('Create a multi-task project')
  .requiredOption('--title <title>', 'Project title')
  .option('--desc <description>', 'Project description', '')
  .option('--tasks <tasks...>', 'Tasks as "type:title" pairs')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    ensureDirs();
    const projectId = generateId();
    const taskEntries = [];

    for (const spec of (opts.tasks || [])) {
      const colonIdx = spec.indexOf(':');
      if (colonIdx === -1) {
        console.error(`Invalid task spec: "${spec}". Use "type:title" format.`);
        process.exit(1);
      }
      const type = spec.slice(0, colonIdx);
      const title = spec.slice(colonIdx + 1);
      const taskId = generateId();
      const deadline = DEFAULT_DEADLINES[type] ?? 0;

      const task = {
        task_id: taskId,
        title,
        description: title,
        type,
        status: 'pending',
        owner: null,
        project_id: projectId,
        depends_on: taskEntries.length > 0 ? [taskEntries[taskEntries.length - 1].task_id] : [],
        output_path: null,
        metadata: {},
        deadline_minutes: deadline,
        blocked_on: null,
        human_input: null,
        created_at: now(),
        claimed_at: null,
        completed_at: null,
        log: [{
          ts: now(),
          event: 'created',
          agent: 'hive-cli',
          detail: `Task created as part of project "${opts.title}"`
        }]
      };

      writeTask(task);
      taskEntries.push({ task_id: taskId, title, type });
    }

    const project = {
      project_id: projectId,
      title: opts.title,
      description: opts.desc,
      tasks: taskEntries,
      created_at: now(),
      status: 'active'
    };

    const projectPath = join(PROJECTS_DIR, `project-${projectId}.json`);
    writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n');

    if (opts.json) {
      console.log(JSON.stringify(project, null, 2));
    } else {
      console.log(`Created project: ${projectId}`);
      console.log(`  Title: ${opts.title}`);
      console.log(`  Tasks:`);
      for (const t of taskEntries) {
        console.log(`    ${t.task_id}  [${t.type}] ${t.title}`);
      }
    }
  });

// project update
projectCmd
  .command('update <project-id>')
  .description('Update a project')
  .option('--title <title>', 'New project title')
  .option('--desc <description>', 'New project description')
  .option('--status <status>', 'New project status')
  .option('--json', 'Output as JSON')
  .action((projectId, opts) => {
    const projectPath = join(PROJECTS_DIR, `project-${projectId}.json`);
    if (!existsSync(projectPath)) {
      console.error(`Project not found: ${projectId}`);
      process.exit(1);
    }
    const project = JSON.parse(readFileSync(projectPath, 'utf-8'));

    if (opts.title) project.title = opts.title;
    if (opts.desc) project.description = opts.desc;
    if (opts.status) project.status = opts.status;

    writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n');

    if (opts.json) {
      console.log(JSON.stringify(project, null, 2));
    } else {
      console.log(`Updated project ${projectId}: ${project.title} [${project.status}]`);
    }
  });

// summary
program
  .command('summary')
  .description('Show task board summary')
  .action(() => {
    const tasks = listTaskFiles(ACTIVE_DIR);

    const counts = { pending: 0, in_progress: 0, blocked: 0, completed: 0, failed: 0 };
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }

    const total = tasks.length;
    console.log('\n  ╔══════════════════════════════════╗');
    console.log('  ║       claw-hive task board       ║');
    console.log('  ╠══════════════════════════════════╣');
    console.log(`  ║  Pending:      ${String(counts.pending).padStart(3)}              ║`);
    console.log(`  ║  In Progress:  ${String(counts.in_progress).padStart(3)}              ║`);
    console.log(`  ║  Blocked:      ${String(counts.blocked).padStart(3)}              ║`);
    console.log(`  ║  Completed:    ${String(counts.completed).padStart(3)}              ║`);
    console.log(`  ║  Failed:       ${String(counts.failed).padStart(3)}              ║`);
    console.log('  ╠══════════════════════════════════╣');
    console.log(`  ║  Total:        ${String(total).padStart(3)}              ║`);
    console.log('  ╚══════════════════════════════════╝\n');

    const blocked = tasks.filter(t => t.status === 'blocked');
    if (blocked.length > 0) {
      console.log('  Blocked tasks needing attention:');
      for (const t of blocked) {
        const needs = t.human_input?.needed || t.blocked_on;
        console.log(`    ${t.task_id}  ${t.title}`);
        console.log(`      Needs: ${needs}`);
      }
      console.log();
    }

    const active = tasks.filter(t => t.status === 'in_progress');
    if (active.length > 0) {
      console.log('  Active tasks:');
      for (const t of active) {
        const duration = t.claimed_at
          ? Math.round((Date.now() - new Date(t.claimed_at).getTime()) / 60000) + ' min'
          : '?';
        console.log(`    ${t.task_id}  ${t.title} [${t.owner || '?'}] (${duration})`);
      }
      console.log();
    }
  });

program.parse();
