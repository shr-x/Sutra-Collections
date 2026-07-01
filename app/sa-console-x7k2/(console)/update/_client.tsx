'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  startUpdateAction,
  getUpdateStatusAction,
  rollbackUpdateAction,
  type UpdateLog,
} from './actions';

interface Props {
  initialGitHash: string;
  initialLog: UpdateLog | null;
}

export default function UpdateClient({ initialGitHash, initialLog }: Props) {
  const [gitHash] = useState(initialGitHash);
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [pollLog, setPollLog] = useState<UpdateLog | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackDone, setRollbackDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  // The "active" log: prefer polling result over the initial one
  const displayLog = pollLog ?? initialLog;
  const isRunning = displayLog?.status === 'running' || (currentLogId && !pollLog);

  // Poll while running
  useEffect(() => {
    if (!currentLogId) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const log = await getUpdateStatusAction(currentLogId);
      if (cancelled) return;
      if (log) setPollLog(log);
      if (!log || log.status === 'running') {
        setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [currentLogId]);

  const handleStart = useCallback(async () => {
    setStartError(null);
    setStarting(true);
    setPollLog(null);
    try {
      const res = await startUpdateAction();
      if (!res.success) {
        setStartError(res.error ?? 'Failed to start update.');
      } else if (res.logId) {
        setCurrentLogId(res.logId);
      }
    } finally {
      setStarting(false);
    }
  }, []);

  const handleRollback = useCallback(async (logId: string) => {
    if (!confirm('Roll back to the previous git commit and restore the DB backup? This cannot be undone.')) return;
    setRollbackError(null);
    setRollingBack(true);
    try {
      const res = await rollbackUpdateAction(logId);
      if (res.success) {
        setRollbackDone(true);
        setPollLog(null);
        setCurrentLogId(null);
      } else {
        setRollbackError(res.error ?? 'Rollback failed.');
      }
    } finally {
      setRollingBack(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Current state */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-xs text-gray-500">Current commit</p>
        <p className="mt-1 font-mono text-lg text-white">{gitHash}</p>
      </div>

      {/* Start update */}
      {!isRunning && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleStart}
            disabled={starting}
            className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start Update'}
          </button>
          <p className="text-xs text-gray-600">
            Runs: git pull → DB backup → docker compose up --build
          </p>
        </div>
      )}

      {startError && (
        <p className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {startError}
        </p>
      )}

      {/* Status log */}
      {displayLog && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-300">Update Log</p>
            <StatusBadge status={displayLog.status} />
          </div>

          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black p-4 font-mono text-xs text-green-400">
            {[
              `Log ID:     ${displayLog.id}`,
              `Started:    ${new Date(displayLog.started_at).toLocaleString('en-IN')}`,
              displayLog.completed_at
                ? `Completed:  ${new Date(displayLog.completed_at).toLocaleString('en-IN')}`
                : null,
              displayLog.git_before ? `Git before: ${displayLog.git_before}` : null,
              displayLog.git_after ? `Git after:  ${displayLog.git_after}` : null,
              displayLog.backup_path ? `Backup:     ${displayLog.backup_path}` : null,
              displayLog.error_msg ? `\nERROR:\n${displayLog.error_msg}` : null,
              displayLog.status === 'running' ? '\n[running… polling every 2s]' : null,
            ]
              .filter(Boolean)
              .join('\n')}
          </pre>

          {/* Rollback button — only if last update succeeded and has a backup */}
          {displayLog.status === 'success' && displayLog.backup_path && !rollbackDone && (
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={() => handleRollback(displayLog.id)}
                disabled={rollingBack}
                className="rounded border border-red-700 px-4 py-1.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                {rollingBack ? 'Rolling back…' : 'Rollback'}
              </button>
              <p className="text-xs text-gray-600">
                Restores DB backup and resets git to {displayLog.git_before ?? 'previous commit'}.
              </p>
            </div>
          )}

          {rollbackDone && (
            <p className="mt-3 text-sm text-green-400">Rollback initiated. Reload to see new state.</p>
          )}

          {rollbackError && (
            <p className="mt-3 rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {rollbackError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    running: 'bg-yellow-900 text-yellow-300 animate-pulse',
    success: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    rolled_back: 'bg-purple-900 text-purple-300',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colours[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  );
}
