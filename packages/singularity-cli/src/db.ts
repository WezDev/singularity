import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";

const DB_PATH = resolve(homedir(), ".openclaw/singularity/state.db");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    scheduled_at TEXT
);

CREATE TABLE IF NOT EXISTS steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    input TEXT,
    output TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    created_at TEXT DEFAULT (datetime('now')),
    claimed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    acceptance_criteria TEXT,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    output TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (step_id) REFERENCES steps(id)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    step_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
`;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
    if (!_db) {
        const dir = resolve(homedir(), ".openclaw/singularity");
        mkdirSync(dir, { recursive: true });
        _db = new DatabaseSync(DB_PATH);
        _db.exec("PRAGMA journal_mode=WAL");
    }
    return _db;
}

export function initDb(): void {
    const db = getDb();
    db.exec(SCHEMA_SQL);
}

export function dbExists(): boolean {
    return existsSync(DB_PATH);
}

export function queryAll<T>(sql: string, ...params: SQLInputValue[]): T[] {
    const db = getDb();
    return db.prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    const db = getDb();
    return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function insertEvent(
    runId: string | null,
    stepId: string | null,
    eventType: string,
    details?: Record<string, unknown>,
): void {
    const db = getDb();
    db.prepare(
        "INSERT INTO events (run_id, step_id, event_type, details) VALUES (?, ?, ?, ?)"
    ).run(runId, stepId, eventType, details ? JSON.stringify(details) : null);
}
