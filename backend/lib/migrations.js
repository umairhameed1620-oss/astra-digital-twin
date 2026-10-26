// Runs pending SQL migrations at startup, guarded by an advisory lock so only one instance migrates.
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const log = require('./log');

const DIR = path.join(__dirname, '..', 'migrations');
const LOCK_ID = 774411;

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE NOT NULL, executed_at TIMESTAMP DEFAULT NOW())`);
    const done = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));

    // A database created before the migration runner existed already has the 001 tables.
    if (!done.has('001_initial_schema.sql')) {
      const t = await client.query("SELECT to_regclass('public.spacecraft') AS t");
      if (t.rows[0].t) {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', ['001_initial_schema.sql']);
        done.add('001_initial_schema.sql');
        log.info('Existing schema detected; marked 001_initial_schema.sql as applied');
      }
    }

    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        await client.query('COMMIT');
        log.info('Migration applied', { file: f });
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
};

module.exports = { run };
