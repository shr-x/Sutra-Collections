import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';

// SHRX → Updates. The app never runs shell or docker commands: it only queues
// a request row (action from a fixed list, no free text) and reads back what
// the updater container reports. See updater/update.sh and UPDATER.md.

const OFFLINE_AFTER_SECONDS = 120;

async function expireIfOffline(): Promise<boolean> {
  const s = await query<{ offline: boolean }>(
    `SELECT COALESCE((SELECT last_seen < NOW() - make_interval(secs => $1) FROM updater_status WHERE id = 1), TRUE) AS offline`,
    [OFFLINE_AFTER_SECONDS]
  );
  const offline = s.rows[0].offline;
  if (offline) {
    // Don't leave requests pending forever when nothing will pick them up.
    await query(
      `UPDATE update_requests SET status = 'expired', finished_at = NOW(),
              error = 'Updater offline — the request was never picked up'
       WHERE status = 'pending' AND requested_at < NOW() - make_interval(secs => $1)`,
      [OFFLINE_AFTER_SECONDS]
    );
  }
  return offline;
}

function appBuild(): string | null {
  try { return fs.readFileSync(path.join(process.cwd(), '.git-commit'), 'utf8').trim(); } catch { return null; }
}

export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const offline = await expireIfOffline();
  const [status, history] = await Promise.all([
    query(`SELECT *, EXTRACT(EPOCH FROM (NOW() - last_seen))::int AS seconds_since_seen FROM updater_status WHERE id = 1`),
    query(
      `SELECT id, requested_at, requested_by, action, status, started_at, finished_at, from_commit, to_commit,
              backup_file, error, needs_manual_restart,
              EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::int AS duration_seconds
       FROM update_requests WHERE action IN ('update','rollback') ORDER BY requested_at DESC LIMIT 20`
    ),
  ]);
  const latest = await query(
    `SELECT id, action, status, log, requested_at, started_at, finished_at, error, backup_file, needs_manual_restart
     FROM update_requests ORDER BY requested_at DESC LIMIT 1`
  );
  return NextResponse.json({
    offline,
    status: status.rows[0] ?? null,
    appBuild: appBuild(),
    latest: latest.rows[0] ?? null,
    history: history.rows,
  });
}

const Body = z.object({ action: z.enum(['check', 'update', 'rollback']) });

export async function POST(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const { action } = parsed.data;

  if (await expireIfOffline()) {
    await shrxAudit(`update.${action}.refused`, null, { reason: 'updater offline' }, g.ip);
    return NextResponse.json({ error: 'Updater offline — it has not reported in for over 2 minutes. Nothing was queued.' }, { status: 409 });
  }
  try {
    const r = await query<{ id: string }>(
      `INSERT INTO update_requests (requested_by, action) VALUES ($1, $2) RETURNING id`,
      [`SHRX console (${g.ip})`, action]
    );
    await shrxAudit(`update.${action}.requested`, r.rows[0].id, null, g.ip);
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      await shrxAudit(`update.${action}.refused`, null, { reason: 'another update is queued or running' }, g.ip);
      return NextResponse.json({ error: 'An update or rollback is already queued or running.' }, { status: 409 });
    }
    throw err;
  }
}
