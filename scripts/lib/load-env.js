'use strict';

const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

function parseEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) {
    return null;
  }

  const key = match[1];
  let value = match[2] || '';

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  } else {
    value = value.split(/\s+#/)[0].trim();
  }

  return { key, value };
}

function loadEnv() {
  const cwd = process.cwd();
  const envFiles = [join(cwd, '.llemy', '.env'), join(cwd, '.env')];

  for (const envPath of envFiles) {
    if (!existsSync(envPath)) {
      continue;
    }

    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }
      if (!process.env[parsed.key]) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}

module.exports = { loadEnv };
