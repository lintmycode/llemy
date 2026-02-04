#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { readFileSync } = require('fs');
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

async function runCodex(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      'codex',
      args,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50, timeout: timeoutMs },
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

async function assertCodexReady() {
  try {
    await runCommand('codex', ['--version']);
  } catch {
    die('codex CLI not available');
  }
}

function buildImplementationPrompt(issue, repo) {
  const body = issue.body && issue.body.trim() ? issue.body : '_No issue body_';
  return [
    `Implement GitHub issue ${repo}#${issue.number} exactly as written.`,
    `Issue title: ${issue.title || '_Untitled_'}`,
    `Issue URL: ${issue.url}`,
    '',
    'Issue body:',
    body,
    '',
    'Execution requirements:',
    '- Apply the requested changes in this repository.',
    '- Keep the implementation faithful to the issue text.',
    '- Run any relevant verification commands and include their outcomes.',
    '- Return a concise completion summary with changed files and checks run.'
  ].join('\n');
}

async function relabelIssue(repo, number, removeLabel, addLabel) {
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

async function addIssueComment(repo, number, comment) {
  await runGh(['issue', 'comment', String(number), '--repo', repo, '--body', comment]);
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
  const inputFile = process.env.INPUT_FILE || join('.llemy', 'llemy-todo-issues.json');
  const fromLabel = process.env.FROM_LABEL || 'llemy-todo';
  const doneLabel = process.env.DONE_LABEL || 'llemy-done';
  const codexTimeoutMs = Number.parseInt(process.env.CODEX_TIMEOUT_MS || '', 10) || 1000 * 60 * 30;
  const codexArgsPrefix = (process.env.CODEX_ARGS_PREFIX || '--full-auto')
    .split(' ')
    .map((v) => v.trim())
    .filter(Boolean);

  const payload = readJsonFile(inputFile);
  const issues = collectIssues(payload);

  if (!issues.length) {
    die(`No issues to process in ${inputFile}`);
  }

  await assertGhReady();
  await assertCodexReady();

  const failures = [];
  let completed = 0;

  for (const entry of issues) {
    const tag = `${entry.repo}#${entry.number}`;
    try {
      process.stdout.write(`\n[${tag}] Fetching issue...\n`);
      const issue = await fetchIssue(entry.repo, entry.number);
      const prompt = buildImplementationPrompt(issue, entry.repo);
      const codexArgs = ['exec', ...codexArgsPrefix, '--cd', process.cwd(), prompt];

      process.stdout.write(`[${tag}] Running Codex implementation...\n`);
      const implementationSummaryRaw = await runCodex(codexArgs, codexTimeoutMs);
      const implementationSummary =
        implementationSummaryRaw.trim() || 'Implementation completed. (No summary text returned)';

      process.stdout.write(`[${tag}] Adding completion comment...\n`);
      const comment = `✅ Implementation completed by Codex\n\n${implementationSummary}`;
      await addIssueComment(entry.repo, entry.number, comment);

      process.stdout.write(`[${tag}] Relabeling issue...\n`);
      await relabelIssue(entry.repo, entry.number, fromLabel, doneLabel);

      completed += 1;
      process.stdout.write(`[${tag}] ✓ Implemented and labeled ${doneLabel}\n`);
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
