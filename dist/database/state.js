import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { paths } from '../filesystem/paths.js';
// ─── Schema Migrations ────────────────────────────────────────────────────────
const MIGRATIONS = [
    // v1: Initial schema
    `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    job_title TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    tokens_used INTEGER,
    cost_usd REAL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);
  CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);

  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_total INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_usage_date ON usage(date);
  CREATE INDEX IF NOT EXISTS idx_usage_agent_id ON usage(agent_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_date_agent ON usage(date, agent_id);

  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    raw_log TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_activity_agent_id ON activity(agent_id);
  CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity(timestamp);
  CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity(event_type);

  CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO migrations (version) VALUES (1);
  `,
];
// ─── Database Client ──────────────────────────────────────────────────────────
/**
 * SQLite-backed state store for SDK consumers (e.g., Horizon dashboard).
 *
 * Stores run history, usage records, and activity logs that don't belong
 * in OpenClaw's config. Uses better-sqlite3 for synchronous, fast access.
 */
export class StateDatabase {
    db;
    constructor(dbPath) {
        const resolvedPath = dbPath || join(paths.home, 'horizon', 'state.db');
        // Ensure parent directory exists
        const dir = join(resolvedPath, '..');
        mkdirSync(dir, { recursive: true });
        this.db = new Database(resolvedPath);
        // Performance pragmas
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.migrate();
    }
    // ── Migrations ────────────────────────────────────────────────────────────
    migrate() {
        // Check current version
        let currentVersion = 0;
        try {
            const row = this.db.prepare('SELECT MAX(version) as v FROM migrations').get();
            currentVersion = row?.v ?? 0;
        }
        catch {
            // migrations table doesn't exist yet — version 0
        }
        // Apply pending migrations
        for (let i = currentVersion; i < MIGRATIONS.length; i++) {
            this.db.exec(MIGRATIONS[i]);
        }
    }
    // ── Runs ──────────────────────────────────────────────────────────────────
    get runs() {
        const db = this.db;
        return {
            insert(run) {
                db.prepare(`
          INSERT INTO runs (id, job_id, job_title, agent_id, agent_name, started_at, completed_at, duration_seconds, status, tokens_used, cost_usd, error)
          VALUES (@id, @jobId, @jobTitle, @agentId, @agentName, @startedAt, @completedAt, @durationSeconds, @status, @tokensUsed, @costUsd, @error)
        `).run({
                    id: run.id,
                    jobId: run.jobId,
                    jobTitle: run.jobTitle,
                    agentId: run.agentId,
                    agentName: run.agentName,
                    startedAt: run.startedAt,
                    completedAt: run.completedAt,
                    durationSeconds: run.durationSeconds,
                    status: run.status,
                    tokensUsed: run.tokensUsed,
                    costUsd: run.costUsd,
                    error: run.error,
                });
            },
            complete(id, result) {
                db.prepare(`
          UPDATE runs SET
            completed_at = datetime('now'),
            duration_seconds = @durationSeconds,
            status = @status,
            tokens_used = @tokensUsed,
            cost_usd = @costUsd,
            error = @error
          WHERE id = @id
        `).run({
                    id,
                    status: result.status,
                    durationSeconds: result.durationSeconds,
                    tokensUsed: result.tokensUsed ?? null,
                    costUsd: result.costUsd ?? null,
                    error: result.error ?? null,
                });
            },
            get(id) {
                const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
                return row ? mapRunRow(row) : null;
            },
            listForJob(jobId, limit = 50) {
                const rows = db.prepare('SELECT * FROM runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?').all(jobId, limit);
                return rows.map(mapRunRow);
            },
            listRecent(limit = 50) {
                const rows = db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit);
                return rows.map(mapRunRow);
            },
            listForAgent(agentId, limit = 50) {
                const rows = db.prepare('SELECT * FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?').all(agentId, limit);
                return rows.map(mapRunRow);
            },
        };
    }
    // ── Usage ─────────────────────────────────────────────────────────────────
    get usage() {
        const db = this.db;
        return {
            upsert(record) {
                db.prepare(`
          INSERT INTO usage (id, date, agent_id, agent_name, model, tokens_input, tokens_output, tokens_total, cost_usd)
          VALUES (@id, @date, @agentId, @agentName, @model, @tokensInput, @tokensOutput, @tokensTotal, @costUsd)
          ON CONFLICT(date, agent_id) DO UPDATE SET
            tokens_input = tokens_input + excluded.tokens_input,
            tokens_output = tokens_output + excluded.tokens_output,
            tokens_total = tokens_total + excluded.tokens_total,
            cost_usd = cost_usd + excluded.cost_usd
        `).run({
                    id: record.id,
                    date: record.date,
                    agentId: record.agentId,
                    agentName: record.agentName,
                    model: record.model,
                    tokensInput: record.tokensInput,
                    tokensOutput: record.tokensOutput,
                    tokensTotal: record.tokensTotal,
                    costUsd: record.costUsd,
                });
            },
            getByDateRange(from, to) {
                const rows = db.prepare('SELECT * FROM usage WHERE date >= ? AND date <= ? ORDER BY date ASC').all(from, to);
                return rows.map(mapUsageRow);
            },
            getByAgent(agentId, from, to) {
                if (from && to) {
                    const rows = db.prepare('SELECT * FROM usage WHERE agent_id = ? AND date >= ? AND date <= ? ORDER BY date ASC').all(agentId, from, to);
                    return rows.map(mapUsageRow);
                }
                const rows = db.prepare('SELECT * FROM usage WHERE agent_id = ? ORDER BY date DESC LIMIT 30').all(agentId);
                return rows.map(mapUsageRow);
            },
            getTotals(from, to) {
                const row = db.prepare(`
          SELECT COALESCE(SUM(tokens_total), 0) as tokensTotal, COALESCE(SUM(cost_usd), 0) as costUsd
          FROM usage WHERE date >= ? AND date <= ?
        `).get(from, to);
                return row;
            },
            getPerAgentTotals(from, to) {
                const rows = db.prepare(`
          SELECT agent_id, agent_name, model,
            SUM(tokens_total) as tokensTotal, SUM(cost_usd) as costUsd, COUNT(*) as runCount
          FROM usage WHERE date >= ? AND date <= ?
          GROUP BY agent_id ORDER BY costUsd DESC
        `).all(from, to);
                return rows.map(r => ({
                    agentId: String(r.agent_id),
                    agentName: String(r.agent_name),
                    model: String(r.model),
                    tokensTotal: Number(r.tokensTotal),
                    costUsd: Number(r.costUsd),
                    runCount: Number(r.runCount),
                }));
            },
        };
    }
    // ── Activity ──────────────────────────────────────────────────────────────
    get activity() {
        const db = this.db;
        return {
            insert(record) {
                db.prepare(`
          INSERT INTO activity (id, agent_id, agent_name, event_type, summary, detail, timestamp, tokens_used, cost_usd, raw_log)
          VALUES (@id, @agentId, @agentName, @eventType, @summary, @detail, @timestamp, @tokensUsed, @costUsd, @rawLog)
        `).run({
                    id: record.id,
                    agentId: record.agentId,
                    agentName: record.agentName,
                    eventType: record.eventType,
                    summary: record.summary,
                    detail: record.detail,
                    timestamp: record.timestamp,
                    tokensUsed: record.tokensUsed,
                    costUsd: record.costUsd,
                    rawLog: record.rawLog,
                });
            },
            listRecent(limit = 100) {
                const rows = db.prepare('SELECT * FROM activity ORDER BY timestamp DESC LIMIT ?').all(limit);
                return rows.map(mapActivityRow);
            },
            listForAgent(agentId, limit = 100) {
                const rows = db.prepare('SELECT * FROM activity WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?').all(agentId, limit);
                return rows.map(mapActivityRow);
            },
            listByType(eventType, limit = 100) {
                const rows = db.prepare('SELECT * FROM activity WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?').all(eventType, limit);
                return rows.map(mapActivityRow);
            },
            search(query, limit = 50) {
                const rows = db.prepare("SELECT * FROM activity WHERE summary LIKE ? OR detail LIKE ? ORDER BY timestamp DESC LIMIT ?").all(`%${query}%`, `%${query}%`, limit);
                return rows.map(mapActivityRow);
            },
        };
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /** Close the database connection. */
    close() {
        this.db.close();
    }
}
// ─── Row Mappers ──────────────────────────────────────────────────────────────
function mapRunRow(r) {
    return {
        id: String(r.id),
        jobId: String(r.job_id),
        jobTitle: String(r.job_title ?? ''),
        agentId: String(r.agent_id),
        agentName: String(r.agent_name ?? ''),
        startedAt: String(r.started_at),
        completedAt: r.completed_at ? String(r.completed_at) : null,
        durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
        status: String(r.status),
        tokensUsed: r.tokens_used != null ? Number(r.tokens_used) : null,
        costUsd: r.cost_usd != null ? Number(r.cost_usd) : null,
        error: r.error ? String(r.error) : null,
    };
}
function mapUsageRow(r) {
    return {
        id: String(r.id),
        date: String(r.date),
        agentId: String(r.agent_id),
        agentName: String(r.agent_name ?? ''),
        model: String(r.model ?? ''),
        tokensInput: Number(r.tokens_input),
        tokensOutput: Number(r.tokens_output),
        tokensTotal: Number(r.tokens_total),
        costUsd: Number(r.cost_usd),
    };
}
function mapActivityRow(r) {
    return {
        id: String(r.id),
        agentId: String(r.agent_id),
        agentName: String(r.agent_name ?? ''),
        eventType: String(r.event_type),
        summary: String(r.summary ?? ''),
        detail: String(r.detail ?? ''),
        timestamp: String(r.timestamp),
        tokensUsed: Number(r.tokens_used ?? 0),
        costUsd: Number(r.cost_usd ?? 0),
        rawLog: r.raw_log ? String(r.raw_log) : null,
    };
}
//# sourceMappingURL=state.js.map