import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PoolClient } from 'pg';
import pool from '../lib/db';

async function runSqlFile(client: PoolClient, filePath: string, label: string) {
  if (!existsSync(filePath)) {
    console.log(`  (skipping ${label} — file not found)`);
    return;
  }
  const sql = readFileSync(filePath, 'utf-8');
  await client.query(sql);
  console.log(`✓ ${label}`);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await runSqlFile(client, join(process.cwd(), 'db', 'schema.sql'), 'schema.sql');
    await runSqlFile(
      client,
      join(process.cwd(), 'db', 'migrations', 'production-sync.sql'),
      'production-sync.sql'
    );

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
