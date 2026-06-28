const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` });

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);
};

const getExecutedMigrations = async (client) => {
  const result = await client.query('SELECT filename FROM schema_migrations ORDER BY id');
  return result.rows.map(r => r.filename);
};

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const executed = await getExecutedMigrations(client);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    const pending = files.filter(f => !executed.includes(f));

    if (pending.length === 0) {
      console.log('✅ All migrations up to date');
      return;
    }

    for (const file of pending) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Migration completed: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed: ${file}`, err.message);
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations().catch(err => { console.error('Migration error:', err); process.exit(1); });
