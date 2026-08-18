const Database = require('better-sqlite3');
const path = require('path');
const { DB_PATH, initDatabase } = require('../init-db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    if (!fs.existsSync(DB_PATH)) initDatabase();
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

async function query(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

async function getOne(sql, params = []) {
  return getDb().prepare(sql).get(...params) || null;
}

async function getAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

async function run(sql, params = []) {
  const result = getDb().prepare(sql).run(...params);
  return {
    rowCount: result.changes,
    lastInsertRowid: result.lastInsertRowid,
    rows: [],
  };
}

async function transaction(fn) {
  const database = getDb();
  const tx = {
    getOne: (sql, params) => database.prepare(sql).get(...params) || null,
    run: (sql, params) => {
      const result = database.prepare(sql).run(...params);
      return { rowCount: result.changes, lastInsertRowid: result.lastInsertRowid, rows: [] };
    },
  };
  const wrapped = database.transaction(() => fn(tx));
  return wrapped();
}

module.exports = { query, getOne, getAll, run, transaction, getDb };
