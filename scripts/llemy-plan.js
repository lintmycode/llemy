#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { join } = require('path');
const { mkdirSync, createWriteStream } = require('fs');
const { loadEnv } = require('./lib/load-env');

loadEnv();

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runStep(scriptName, logStream) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(__dirname, scriptName)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      if (logStream) logStream.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      if (logStream) logStream.write(data);
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start ${scriptName}: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} exited due to signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${scriptName} failed with exit code ${code}`));
        return;
      }

      resolve();
    });
  });
}

async function main() {
  const logsDir = join(process.cwd(), '.llemy', 'logs');
  mkdirSync(logsDir, { recursive: true });

  const logPath = join(logsDir, 'plan.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const timestamp = new Date().toISOString();
  logStream.write(`\n=== LLEMY PLAN RUN: ${timestamp} ===\n`);

  try {
    process.stdout.write('Running scan-plan-issues.js...\n');
    logStream.write('Running scan-plan-issues.js...\n');
    await runStep('scan-plan-issues.js', logStream);

    process.stdout.write('Running process-plan-issues.js...\n');
    logStream.write('Running process-plan-issues.js...\n');
    await runStep('process-plan-issues.js', logStream);

    logStream.write('=== COMPLETED SUCCESSFULLY ===\n');
  } catch (error) {
    logStream.write(`=== FAILED: ${error.message} ===\n`);
    throw error;
  } finally {
    logStream.end();
  }
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
