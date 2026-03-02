import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActivityModule } from "./activity.js";
import type { ResolvedSDKConfig } from "../types.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    run_spec TEXT,
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
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    claimed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id)
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

let tmpDir: string;
let dbPath: string;
let db: DatabaseSync;

function makeConfig(): ResolvedSDKConfig {
    return {
        gatewayUrl: "http://localhost:3000",
        cliBinary: "openclaw",
        dbPath,
        configPath: "/tmp/config.json",
        cronStorePath: "/tmp/cron.json",
        skillsDir: "/tmp/skills",
        agentsBaseDir: "/tmp/agents",
        workflowsDir: "/tmp/workflows",
    };
}

describe("ActivityModule", () => {
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "singularity-activity-"));
        dbPath = join(tmpDir, "test.db");
        db = new DatabaseSync(dbPath);
        db.exec("PRAGMA journal_mode=WAL");
        db.exec(SCHEMA_SQL);

        // Seed data
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('run-1', 'wf', 'Task 1')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id) VALUES ('step-1', 'run-1', 'code', 'coder')`);
        db.exec(`INSERT INTO events (run_id, step_id, event_type) VALUES ('run-1', 'step-1', 'step_started')`);
        db.exec(`INSERT INTO events (run_id, step_id, event_type) VALUES ('run-1', 'step-1', 'step_completed')`);
        db.exec(`INSERT INTO events (run_id, step_id, event_type) VALUES ('run-1', NULL, 'run_started')`);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("list returns all events with no filters", async () => {
        const mod = new ActivityModule(makeConfig());
        // NOTE: ActivityModule.list() has a console.log(data) bug — TODO: remove when fixed upstream
        const result = await mod.list();
        expect(result.total).toBe(3);
        expect(result.data).toHaveLength(3);
    });

    it("list filtered by runId", async () => {
        const mod = new ActivityModule(makeConfig());
        const result = await mod.list({ runId: "run-1" });
        expect(result.total).toBe(3);
    });

    it("list filtered by stepId", async () => {
        const mod = new ActivityModule(makeConfig());
        const result = await mod.list({ stepId: "step-1" });
        expect(result.total).toBe(2);
    });

    it("list filtered by eventType", async () => {
        const mod = new ActivityModule(makeConfig());
        const result = await mod.list({ eventType: "step_started" });
        expect(result.total).toBe(1);
        expect(result.data[0].eventType).toBe("step_started");
    });

    it("list respects limit and offset (pagination)", async () => {
        const mod = new ActivityModule(makeConfig());
        const page1 = await mod.list({ limit: 2, offset: 0 });
        expect(page1.data).toHaveLength(2);
        const page2 = await mod.list({ limit: 2, offset: 2 });
        expect(page2.data).toHaveLength(1);
        expect(page1.total).toBe(3);
    });

    it("get returns event by id", async () => {
        const mod = new ActivityModule(makeConfig());
        const allEvents = await mod.list();
        const firstId = allEvents.data[0].id as number;
        const event = await mod.get(firstId);
        expect(event).not.toBeNull();
        expect(event!.id).toBe(firstId);
    });
});
