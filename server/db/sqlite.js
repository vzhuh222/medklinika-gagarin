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

/**
 * better-sqlite3 бросает исключение на .run() для запросов с RETURNING,
 * поэтому такие запросы выполняем через .all() и отдаём строки.
 */
function execute(database, sql, params) {
  const statement = database.prepare(sql);
  if (statement.reader) {
    const rows = statement.all(...params);
    return { rowCount: rows.length, lastInsertRowid: rows[0]?.id, rows };
  }
  const result = statement.run(...params);
  return { rowCount: result.changes, lastInsertRowid: result.lastInsertRowid, rows: [] };
}

async function run(sql, params = []) {
  return execute(getDb(), sql, params);
}

/**
 * better-sqlite3 не принимает async-колбэк в database.transaction(),
 * поэтому границами транзакции управляем вручную — все операции внутри синхронные.
 */
async function transaction(fn) {
  const database = getDb();
  const tx = {
    query: (sql, params = []) => ({ rows: database.prepare(sql).all(...params) }),
    getOne: (sql, params = []) => database.prepare(sql).get(...params) || null,
    getAll: (sql, params = []) => database.prepare(sql).all(...params),
    run: (sql, params = []) => execute(database, sql, params),
  };

  database.prepare('BEGIN IMMEDIATE').run();
  try {
    const result = await fn(tx);
    database.prepare('COMMIT').run();
    return result;
  } catch (err) {
    if (database.inTransaction) database.prepare('ROLLBACK').run();
    throw err;
  }
}

module.exports = { query, getOne, getAll, run, transaction, getDb };
