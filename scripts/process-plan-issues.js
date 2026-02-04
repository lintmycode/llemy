#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { loadEnv } = require('./lib/load-env');

loadEnv();

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || stdout || error.message || 'unknown error').trim();
          reject(new Error(detail));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );
  });
}

async function runGh(args) {
  return runCommand('gh', args);
}

function readJsonFile(filePath) {
  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    die(`Missing input file: ${filePath}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    die(`Invalid JSON in: ${filePath}`);
  }
}

function repoSlug(repo) {
  return String(repo || '')
    .trim()
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function writePlanFile(planPath, issue) {
  const body = issue.body && issue.body.trim() ? issue.body : '_No issue body_';
  const content = [
    '# Source Issue',
    '',
    `- Repo: ${issue.repo}`,
    `- Number: ${issue.number}`,
    `- URL: ${issue.url}`,
    '',
    '## Title',
    '',
    issue.title || '_Untitled_',
    '',
    '## Body',
    '',
    body,
    ''
  ].join('\n');

  writeFileSync(planPath, content, 'utf8');
}

function parseTodoIssue(filePath, fallbackTitle, requiredLabel) {
  const raw = readFileSync(filePath, 'utf8');
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
  const labelsMatch = raw.match(/^LABELS:\s*(.+)$/m);
  const bodyMatch = raw.match(/^BODY:\s*```(?:md)?\r?\n([\s\S]*?)\r?\n```/m);

  const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;
  const labels = labelsMatch
    ? labelsMatch[1]
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  const body = bodyMatch ? bodyMatch[1].trim() : raw.trim();

  if (!labels.includes(requiredLabel)) {
    labels.unshift(requiredLabel);
  }

  if (!title) {
    throw new Error(`Missing TITLE in ${filePath}`);
  }
  if (!body) {
    throw new Error(`Missing BODY in ${filePath}`);
  }

  return { title, labels, body };
}

async function assertGhReady() {
  try {
    await runGh(['--version']);
    await runGh(['auth', 'status']);
  } catch {
    die('gh CLI not available or not authenticated');
  }
}

async function fetchIssue(repo, number) {
  const out = await runGh(['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,url,body']);
  let issue;
  try {
    issue = JSON.parse(out);
  } catch {
    throw new Error(`Failed to parse issue JSON for ${repo}#${number}`);
  }
  return issue;
}

async function createTodoIssue(repo, todoIssue) {
  const args = ['issue', 'create', '--repo', repo, '--title', todoIssue.title, '--body', todoIssue.body];
  for (const label of todoIssue.labels) {
    args.push('--label', label);
  }
  return runGh(args);
}

async function relabelOriginalIssue(repo, number, removeLabel, addLabel) {
  try {
    await runGh([
      'issue',
      'edit',
      String(number),
      '--repo',
      repo,
      '--remove-label',
      removeLabel,
      '--add-label',
      addLabel
    ]);
  } catch {
    await runGh(['issue', 'edit', String(number), '--repo', repo, '--add-label', addLabel]);
  }
}

function collectIssues(payload) {
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  return issues.filter(
    (issue) =>
      issue &&
      !issue.error &&
      typeof issue.repo === 'string' &&
      Number.isInteger(issue.number) &&
      issue.number > 0
  );
}

async function main() {
  const inputFile = process.env.INPUT_FILE || join('.llemy', 'llemy-plan-issues.json');
  const planDir = process.env.PLAN_DIR || join('.llemy', 'plan');
  const todoDir = process.env.TODO_DIR || join('.llemy', 'todo');
  const fromLabel = process.env.FROM_LABEL || 'llemy-plan';
  const plannedLabel = process.env.PLANNED_LABEL || 'llemy-planned';
  const todoLabel = process.env.TODO_LABEL || 'llemy-todo';

  const payload = readJsonFile(inputFile);
  const issues = collectIssues(payload);

  if (!issues.length) {
    die(`No issues to process in ${inputFile}`);
  }

  mkdirSync(planDir, { recursive: true });
  mkdirSync(todoDir, { recursive: true });

  await assertGhReady();

  const failures = [];
  let completed = 0;

  for (const entry of issues) {
    const tag = `${entry.repo}#${entry.number}`;
    try {
      process.stdout.write(`\n[${tag}] Fetching issue...\n`);
      const issue = await fetchIssue(entry.repo, entry.number);
      const slug = repoSlug(entry.repo);
      const planPath = join(planDir, `${slug}_${entry.number}_plan.md`);
      const todoPath = join(todoDir, `${slug}_${entry.number}_todo.md`);

      process.stdout.write(`[${tag}] Writing plan to ${planPath}\n`);
      writePlanFile(planPath, { ...issue, repo: entry.repo });

      process.stdout.write(`[${tag}] Waiting for Claude Code to create ${todoPath}\n`);
      process.stdout.write(`[${tag}] ⏸️  Paused - run this in Claude Code to continue:\n`);
      process.stdout.write(`[${tag}]    "Process plan file ${planPath} and create ${todoPath}"\n`);

      // Wait for todo file to be created
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes
      while (!existsSync(todoPath) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      if (!existsSync(todoPath)) {
        throw new Error(`Timeout waiting for ${todoPath} to be created`);
      }

      process.stdout.write(`[${tag}] ✓ Todo file detected, continuing...\n`);
      process.stdout.write(`[${tag}] Creating llemy-todo issue...\n`);
      const todoIssue = parseTodoIssue(todoPath, `Plan for ${entry.repo}#${entry.number}`, todoLabel);
      const created = await createTodoIssue(entry.repo, todoIssue);

      process.stdout.write(`[${tag}] Relabeling original issue...\n`);
      await relabelOriginalIssue(entry.repo, entry.number, fromLabel, plannedLabel);

      completed += 1;
      process.stdout.write(`[${tag}] ✓ Processed -> ${created}\n`);
    } catch (error) {
      const message = error && error.message ? error.message : 'unknown error';
      failures.push(`${tag}: ${message}`);
      process.stderr.write(`Failed ${tag}: ${message}\n`);
    }
  }

  process.stdout.write(`Done. Completed=${completed} Failed=${failures.length}\n`);
  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
