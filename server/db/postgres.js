const { Pool } = require('pg');
const config = require('../config');
const { convertPlaceholders } = require('./sql-utils');

let pool;

function getPool() {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL не задан. Укажите PostgreSQL или используйте SQLite (без DATABASE_URL).');
    }
    const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  return getPool().query(pgSql, params);
}

async function getOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function getAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  const result = await query(sql, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows,
    lastInsertRowid: result.rows[0]?.id,
  };
}

async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (sql, params) => client.query(convertPlaceholders(sql), params),
      getOne: async (sql, params) => {
        const r = await client.query(convertPlaceholders(sql), params);
        return r.rows[0] || null;
      },
      run: async (sql, params) => {
        const r = await client.query(convertPlaceholders(sql), params);
        return { rowCount: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id };
      },
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, getOne, getAll, run, transaction, getPool };
