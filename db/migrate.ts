import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PoolClient } from 'pg';
import pool from '../lib/db';

async function runSqlFile(client: PoolClient, filePath: string, label: string) {
  const sql = readFileSync(filePath, 'utf-8');
  await client.query(sql);
  console.log(`✓ ${label}`);
}

async function migrate() {
  const migrationsDir = join(process.cwd(), 'db', 'migrations');
  // Zero-padded numeric prefixes (000_, 001_, ...) sort correctly as plain strings.
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const file of files) {
      await runSqlFile(client, join(migrationsDir, file), file);
    }

    await client.query('COMMIT');
    console.log('✓ All migrations applied successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
