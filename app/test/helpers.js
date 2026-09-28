'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Documents are written under KCA_DATA_DIR; point it at a temp folder before loading the app modules.
process.env.KCA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kca-test-'));

const { openDb } = require('../server/db');
const { seed } = require('../server/seed');

const SAMPLES = path.join(__dirname, '..', 'samples');

function freshDb() {
  // Each test DB gets its own documents folder so identical sample files can be stored again.
  process.env.KCA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kca-test-'));
  const db = openDb(':memory:');
  seed(db);
  return db;
}

const user = (db, id) => db.get('SELECT * FROM users WHERE id = ?', id);
const sample = name => fs.readFileSync(path.join(SAMPLES, name));

module.exports = { freshDb, user, sample };
