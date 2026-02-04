#!/usr/bin/env node
'use strict';

const people = ['Alice', 'Bob', 'Charlie', 'Dana', 'Evelyn', 'Frank'];
const actions = ['builds', 'discovers', 'creates', 'explores', 'designs', 'restores'];
const subjects = [
  'a bridge',
  'a treasure',
  'a robot',
  'a garden',
  'an ancient map',
  'a secret laboratory'
];

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function generateRandomFact() {
  const person = getRandomItem(people);
  const action = getRandomItem(actions);
  const subject = getRandomItem(subjects);
  return `${person} ${action} ${subject}.`;
}

function parseCountArg(value) {
  if (value === undefined) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Count must be a positive integer.');
  }

  return parsed;
}

function printRandomFacts(count) {
  for (let index = 0; index < count; index += 1) {
    console.log(generateRandomFact());
  }
}

if (require.main === module) {
  try {
    const count = parseCountArg(process.argv[2]);
    printRandomFacts(count);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  actions,
  generateRandomFact,
  getRandomItem,
  people,
  printRandomFacts,
  subjects
};
