#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const { loadEnv } = require('./lib/load-env');

loadEnv();

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || 'unknown error').trim();
        reject(new Error(detail));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

async function assertGhReady() {
  try {
    await runGh(['--version']);
    await runGh(['auth', 'status']);
  } catch {
    die('gh CLI is unavailable or not authenticated');
  }
}

async function resolveCurrentRepo() {
  const fromEnv = String(process.env.LLEMY_REPO || '').trim();
  if (fromEnv) {
    return fromEnv;
  }

  let json = '';
  try {
    json = await runGh(['repo', 'view', '--json', 'nameWithOwner']);
  } catch {
    die('Unable to resolve current repository. Run inside a GitHub repo or set LLEMY_REPO=owner/name');
  }

  try {
    const parsed = JSON.parse(json);
    const repo = typeof parsed.nameWithOwner === 'string' ? parsed.nameWithOwner.trim() : '';
    if (repo) {
      return repo;
    }
  } catch {
    // Fall through to die below.
  }

  die('Unable to resolve current repository. Run inside a GitHub repo or set LLEMY_REPO=owner/name');
}

function ensureDirectories() {
  const root = process.cwd();
  const dirs = [
    join(root, '.llemy'),
    join(root, '.llemy', 'plan'),
    join(root, '.llemy', 'todo'),
    join(root, '.llemy', 'logs')
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    process.stdout.write(`Created: ${dir}\n`);
  }
}

function ensureEnvFile(root) {
  const envPath = join(root, '.llemy', '.env');
  if (existsSync(envPath)) {
    process.stdout.write(`Exists: ${envPath}\n`);
    return;
  }

  const content = [
    '# LLEMY settings',
    '',
    '# Optional override if running outside the target repository',
    '# LLEMY_REPO=owner/name',
    '',
    '# Labels',
    'LLEMY_PLAN_LABEL=llemy-plan',
    'LLEMY_TODO_LABEL=llemy-todo',
    '# Use script-specific env vars only when needed (FROM_LABEL, DONE_LABEL, etc.)',
    '',
    '# Optional Claude API mode (scripts/process-plan-issues_api.js)',
    '# ANTHROPIC_API_KEY=',
    '# CLAUDE_MODEL=claude-sonnet-4-20250514',
    ''
  ].join('\n');

  writeFileSync(envPath, content, 'utf8');
  process.stdout.write(`Created: ${envPath}\n`);
}

async function listLabelNames(repo) {
  const json = await runGh(['label', 'list', '--repo', repo, '--limit', '200', '--json', 'name']);
  let rows = [];
  try {
    rows = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse gh label list JSON');
  }

  const names = new Set();
  for (const row of rows) {
    if (row && typeof row.name === 'string' && row.name.trim()) {
      names.add(row.name.trim());
    }
  }
  return names;
}

async function ensureLabel(repo, existingNames, label) {
  const args = [
    '--repo',
    repo,
    '--color',
    label.color,
    '--description',
    label.description
  ];

  if (existingNames.has(label.name)) {
    await runGh(['label', 'edit', label.name, ...args]);
    process.stdout.write(`Updated label: ${label.name}\n`);
    return;
  }

  await runGh(['label', 'create', label.name, ...args]);
  process.stdout.write(`Created label: ${label.name}\n`);
}

async function main() {
  await assertGhReady();
  const repo = await resolveCurrentRepo();
  process.stdout.write(`Initializing LLEMY for ${repo}\n`);

  ensureDirectories();
  ensureEnvFile(process.cwd());

  const labels = [
    { name: 'llemy-plan', color: '0e8a16', description: 'Needs planning by Claude' },
    { name: 'llemy-planned', color: '1d76db', description: 'Plan created and ready for handoff' },
    { name: 'llemy-todo', color: 'fbca04', description: 'Ready for Codex implementation' },
    { name: 'llemy-done', color: '5319e7', description: 'Completed by Codex' }
  ];

  const existingNames = await listLabelNames(repo);
  for (const label of labels) {
    await ensureLabel(repo, existingNames, label);
  }

  process.stdout.write('LLEMY init complete.\n');
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
