'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// ── Types ────────────────────────────────────────────────────────────────────

export interface UpdateLog {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  git_before: string | null;
  git_after: string | null;
  backup_path: string | null;
  error_msg: string | null;
}

export interface InitialData {
  gitHash: string;
  lastLog: UpdateLog | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getGitHash(cwd: string): Promise<string> {
  // Try the build-time stamped file first (works in Docker runner without git)
  try {
    const commitFile = path.join(cwd, '.git-commit');
    const content = (await fs.readFile(commitFile, 'utf-8')).trim();
    if (content && content !== 'unknown') return content;
  } catch { /* fall through */ }
  // Fall back to live git
  try {
    const { stdout } = await execAsync('git log -1 --format="%h %s"', { cwd });
    const result = stdout.trim();
    if (result) return result;
  } catch { /* fall through */ }
  // No git — read version from package.json
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')) as { version?: string };
    return `v${pkg.version ?? '?'} (no git repo)`;
  } catch {
    return 'no git repo';
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function getInitialDataAction(): Promise<InitialData> {
  await requireSA();

  const appDir = process.cwd();
  const [gitHash, logRes] = await Promise.all([
    getGitHash(appDir),
    query<UpdateLog>(
      `SELECT id, status, started_at, completed_at, git_before, git_after, backup_path, error_msg
       FROM sa_update_log ORDER BY started_at DESC LIMIT 1`
    ),
  ]);

  return { gitHash, lastLog: logRes.rows[0] ?? null };
}

export async function startUpdateAction(): Promise<{ success: boolean; logId?: string; error?: string }> {
  await requireSA();

  // Require git to be initialised
  const appDir = process.cwd();
  try {
    await execAsync('git rev-parse --git-dir', { cwd: appDir });
  } catch {
    return { success: false, error: 'This directory is not a git repository. Run `git init && git remote add origin <url>` first.' };
  }

  // Prevent concurrent updates
  const running = await query(
    `SELECT id FROM sa_update_log WHERE status = 'running' LIMIT 1`
  );
  if (running.rows.length > 0) {
    return { success: false, error: 'An update is already in progress.' };
  }

  const logRes = await query<{ id: string }>(
    `INSERT INTO sa_update_log (status) VALUES ('running') RETURNING id`
  );
  const logId = logRes.rows[0].id;

  // Fire and forget — client polls getUpdateStatusAction
  runUpdate(logId).catch(() => {});

  return { success: true, logId };
}

async function runUpdate(logId: string): Promise<void> {
  const backupDir = '/var/backups/sutra';
  const appDir = process.cwd();

  try {
    // 1. Record current git hash
    const gitBefore = await getGitHash(appDir);
    await query('UPDATE sa_update_log SET git_before=$1 WHERE id=$2', [gitBefore, logId]);

    // 2. DB backup
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `backup-${Date.now()}.sql`);
    const dbUrl =
      process.env.DATABASE_URL ?? 'postgresql://sutra:sutra@localhost:5432/sutra';
    await execAsync(`pg_dump "${dbUrl}" -f "${backupFile}"`, { cwd: appDir });
    await query('UPDATE sa_update_log SET backup_path=$1 WHERE id=$2', [backupFile, logId]);

    // 3. Git pull
    await execAsync('git pull', { cwd: appDir });

    // 4. Docker rebuild (up to 5 minutes)
    await execAsync('docker compose up --build -d', { cwd: appDir, timeout: 300_000 });

    // 5. New git hash
    const gitAfter = await getGitHash(appDir);

    await query(
      `UPDATE sa_update_log
       SET status='success', git_after=$1, completed_at=NOW()
       WHERE id=$2`,
      [gitAfter, logId]
    );
  } catch (err) {
    await query(
      `UPDATE sa_update_log
       SET status='failed', error_msg=$1, completed_at=NOW()
       WHERE id=$2`,
      [err instanceof Error ? err.message : String(err), logId]
    );
  }
}

export async function getUpdateStatusAction(logId: string): Promise<UpdateLog | null> {
  await requireSA();

  const res = await query<UpdateLog>(
    `SELECT id, status, started_at, completed_at, git_before, git_after, backup_path, error_msg
     FROM sa_update_log WHERE id=$1`,
    [logId]
  );
  return res.rows[0] ?? null;
}

export async function rollbackUpdateAction(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  await requireSA();

  const res = await query<{ backup_path: string | null; git_before: string | null }>(
    `SELECT backup_path, git_before FROM sa_update_log WHERE id=$1 AND status='success'`,
    [logId]
  );
  const row = res.rows[0];
  if (!row) return { success: false, error: 'No successful update found to roll back.' };

  const appDir = process.cwd();
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://sutra:sutra@localhost:5432/sutra';

  try {
    // Restore DB
    if (row.backup_path) {
      await execAsync(`psql "${dbUrl}" < "${row.backup_path}"`, { cwd: appDir });
    }

    // Reset git and rebuild
    if (row.git_before) {
      await execAsync(`git reset --hard ${row.git_before}`, { cwd: appDir });
      await execAsync('docker compose up --build -d', { cwd: appDir, timeout: 300_000 });
    }

    await query(
      `UPDATE sa_update_log SET status='rolled_back', completed_at=NOW() WHERE id=$1`,
      [logId]
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
