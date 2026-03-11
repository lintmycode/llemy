#!/usr/bin/env node
'use strict';

const { execFile, spawnSync } = require('child_process');
const { join } = require('path');
const { loadEnv } = require('./lib/load-env');

loadEnv();

const REPO = process.env.LLEMY_REPO || 'lintmycode/llemy';
const PLAN_LABEL = process.env.LLEMY_PLAN_LABEL || 'llemy-plan';

function die(message) {
  process.stderr.write(`\n❌ ${message}\n`);
  process.exit(1);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message).trim()));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function runStep(label, scriptPath) {
  log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    die(`${label} failed with exit code ${result.status}`);
  }
}

async function main() {
  log('=== llemy end-to-end test ===\n');

  // 1. Create test issue
  log(`▶ Creating test issue on ${REPO} with label [${PLAN_LABEL}]...`);
  const issueUrl = await runGh([
    'issue', 'create',
    '--repo', REPO,
    '--title', '[llemy-test] Create a file called hello.txt with the text "hello world"',
    '--body', 'Create a file called `hello.txt` in the repo root containing exactly the text `hello world`.',
    '--label', PLAN_LABEL
  ]);
  log(`  Created: ${issueUrl}`);
  log('  Waiting for GitHub to index issue...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 2. Run llemy plan
  runStep('llemy plan', join(__dirname, 'llemy-plan.js'));

  // 3. Run llemy do
  runStep('llemy do', join(__dirname, 'llemy-do.js'));

  log('\n✅ Test complete.');
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
