#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { join } = require('path');

const COMMAND_TO_SCRIPT = {
  init: 'llemy-init.js',
  plan: 'llemy-plan.js',
  do: 'llemy-do.js'
};

function printHelp() {
  process.stdout.write(
    [
      'LLEMY CLI',
      '',
      'Usage:',
      '  llemy <command>',
      '',
      'Commands:',
      '  init    Initialize .llemy folders, env template, and labels',
      '  plan    Run planning flow (llemy-plan -> llemy-todo)',
      '  do      Run implementation flow (llemy-todo -> llemy-done)',
      ''
    ].join('\n')
  );
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(__dirname, '..', 'scripts', scriptName)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start ${scriptName}: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} exited due to signal ${signal}`));
        return;
      }
      resolve(code || 0);
    });
  });
}

async function main() {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const scriptName = COMMAND_TO_SCRIPT[command];
  if (!scriptName) {
    process.stderr.write(`Unknown command: ${command}\n\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const code = await runScript(scriptName);
  process.exitCode = code;
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : 'Unexpected error'}\n`);
  process.exit(1);
});
