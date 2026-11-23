const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/app.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE, hash TEXT, created INTEGER
);
CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY, name TEXT, orig TEXT, pkg TEXT, label TEXT,
  status TEXT, secret TEXT, size INTEGER, err TEXT, created INTEGER
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, build_id TEXT, model TEXT, brand TEXT, android TEXT,
  sdk INTEGER, ip TEXT, battery INTEGER, rooted INTEGER,
  first INTEGER, last INTEGER, online INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dev_build ON devices(build_id);
`);

module.exports = db;
