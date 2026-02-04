#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const https = require('https');

// Load .env file
function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
        if (value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

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

async function callClaudeAPI(planContent, claudeMdContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  const prompt = `${claudeMdContent}\n\n---\n\nHere is the plan file to process:\n\n${planContent}\n\n---\n\nPlease generate the LLEMY_TODO_ISSUE following the exact format specified in the CLAUDE.md policy.`;

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  const requestBody = JSON.stringify({
    model: model,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Claude API error: ${res.statusCode} ${data}`));
          return;
        }

        try {
          const response = JSON.parse(data);
          if (response.content && response.content[0] && response.content[0].text) {
            resolve(response.content[0].text);
          } else {
            reject(new Error('Invalid Claude API response format'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Claude API response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Claude API request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

async function main() {
  const inputFile = process.env.INPUT_FILE || join('.llemy', 'llemy-plan-issues.json');
  const planDir = process.env.PLAN_DIR || join('.llemy', 'plan');
  const todoDir = process.env.TODO_DIR || join('.llemy', 'todo');
  const fromLabel = process.env.FROM_LABEL || 'llemy-plan';
  const plannedLabel = process.env.PLANNED_LABEL || 'llemy-planned';
  const todoLabel = process.env.TODO_LABEL || 'llemy-todo';
  const claudeMdPath = join(process.cwd(), '.claude', 'claude.md');

  const payload = readJsonFile(inputFile);
  const issues = collectIssues(payload);

  if (!issues.length) {
    die(`No issues to process in ${inputFile}`);
  }

  if (!existsSync(claudeMdPath)) {
    die(`Missing CLAUDE.md policy file at ${claudeMdPath}`);
  }

  const claudeMdContent = readFileSync(claudeMdPath, 'utf8');

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

      process.stdout.write(`[${tag}] Calling Claude API to generate todo...\n`);
      const planContent = readFileSync(planPath, 'utf8');
      const todoContent = await callClaudeAPI(planContent, claudeMdContent);

      process.stdout.write(`[${tag}] Writing todo to ${todoPath}\n`);
      writeFileSync(todoPath, todoContent, 'utf8');

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
