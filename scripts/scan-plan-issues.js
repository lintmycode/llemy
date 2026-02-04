#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const { mkdirSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');
const { loadEnv } = require('./lib/load-env');

loadEnv();

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
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
    die('gh CLI not available or not authenticated');
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

async function fetchRepoIssues(repo, label, limit) {
  const json = await runGh([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    label,
    '--state',
    'open',
    '--limit',
    String(limit),
    '--json',
    'number,title,url,updatedAt,labels'
  ]);

  let items = [];
  try {
    items = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse gh issue list JSON');
  }

  return items.map((issue) => ({
    repo,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
    labels: Array.isArray(issue.labels) ? issue.labels.map((l) => l.name).filter(Boolean) : []
  }));
}

async function runBatches(items, batchSize, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((item) => worker(item)));
    out.push(...settled);
  }
  return out;
}

function printReport(repos, issuesByRepo, errorsByRepo) {
  for (const repo of repos) {
    const issues = issuesByRepo.get(repo) || [];
    process.stdout.write(`${repo} (${issues.length})\n`);
    for (const issue of issues) {
      process.stdout.write(`  - #${issue.number} ${issue.title} + ${issue.url}\n`);
    }
    const err = errorsByRepo.get(repo);
    if (err) {
      process.stdout.write(`  - ERROR: ${err}\n`);
    }
  }
}

async function main() {
  const label = process.env.LLEMY_PLAN_LABEL || 'llemy-plan';
  const issueLimit = toPositiveInt(process.env.ISSUE_LIMIT, 50);
  const concurrency = toPositiveInt(process.env.CONCURRENCY, 3);
  const outputFile = process.env.OUTPUT_FILE || join('.llemy', 'llemy-plan-issues.json');

  await assertGhReady();
  const repos = [await resolveCurrentRepo()];

  const issues = [];
  const issuesByRepo = new Map();
  const errorsByRepo = new Map();

  const settled = await runBatches(repos, concurrency, async (repo) => {
    try {
      const repoIssues = await fetchRepoIssues(repo, label, issueLimit);
      return { repo, repoIssues };
    } catch (error) {
      return { repo, error: error.message };
    }
  });

  for (const entry of settled) {
    if (entry.status !== 'fulfilled') {
      continue;
    }
    const result = entry.value;
    if (result.error) {
      errorsByRepo.set(result.repo, result.error);
      issues.push({ repo: result.repo, error: result.error });
      continue;
    }
    issuesByRepo.set(result.repo, result.repoIssues);
    issues.push(...result.repoIssues);
  }

  printReport(repos, issuesByRepo, errorsByRepo);

  const payload = {
    generatedAt: new Date().toISOString(),
    label,
    repos,
    issues
  };

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
