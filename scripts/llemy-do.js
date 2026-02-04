#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { createWriteStream, mkdirSync } = require('fs');
const { join } = require('path');

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function now() {
  return new Date().toISOString();
}

function createLogger(logPath) {
  mkdirSync(join(process.cwd(), 'logs'), { recursive: true });
  const stream = createWriteStream(logPath, { flags: 'a' });

  function info(message, options = {}) {
    const writeConsole = options.console !== false;
    const line = `${now()} INFO ${message}\n`;
    if (writeConsole) {
      process.stdout.write(line);
    }
    stream.write(line);
  }

  function error(message, options = {}) {
    const writeConsole = options.console !== false;
    const line = `${now()} ERROR ${message}\n`;
    if (writeConsole) {
      process.stderr.write(line);
    }
    stream.write(line);
  }

  return {
    info,
    error,
    close: () => stream.end()
  };
}

function runStep(scriptName, logger) {
  return new Promise((resolve, reject) => {
    logger.info(`Starting ${scriptName}`);
    const child = spawn(process.execPath, [join(__dirname, scriptName)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logger.info(`[${scriptName}] ${String(chunk).trimEnd()}`, { console: false });
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logger.error(`[${scriptName}] ${String(chunk).trimEnd()}`, { console: false });
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

      logger.info(`Finished ${scriptName}`);
      resolve();
    });
  });
}

async function main() {
  const logger = createLogger(join(process.cwd(), 'logs', 'do.log'));
  logger.info('Starting llemy-do flow');
  try {
    logger.info('Running scan-todo-issues.js');
    await runStep('scan-todo-issues.js', logger);

    logger.info('Running process-todo-issues.js');
    await runStep('process-todo-issues.js', logger);
    logger.info('llemy-do flow completed successfully');
  } finally {
    logger.close();
  }
}

main().catch((error) => {
  die(error && error.message ? error.message : 'Unexpected error');
});
