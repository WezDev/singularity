import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseModule } from "./database.js";
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

describe("DatabaseModule", () => {
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "singularity-db-"));
        dbPath = join(tmpDir, "test.db");
        db = new DatabaseSync(dbPath);
        db.exec("PRAGMA journal_mode=WAL");
        db.exec(SCHEMA_SQL);

        // Seed runs
        db.exec(`INSERT INTO runs (id, workflow, task, status) VALUES ('run-a', 'wf1', 'Build API', 'done')`);
        db.exec(`INSERT INTO runs (id, workflow, task, status) VALUES ('run-b', 'wf2', 'Write tests', 'running')`);
        db.exec(`INSERT INTO runs (id, workflow, task, status) VALUES ('run-c', 'wf1', 'Deploy app', 'failed')`);

        // Seed steps
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, status, output)
                 VALUES ('step-1', 'run-a', 'code', 'coder', 'done', 'STATUS: done\nBRANCH: main')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, status)
                 VALUES ('step-2', 'run-a', 'review', 'reviewer', 'done')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, status)
                 VALUES ('step-3', 'run-b', 'code', 'coder', 'running')`);

        // Seed stories
        db.exec(`INSERT INTO stories (id, step_id, title, acceptance_criteria)
                 VALUES ('story-1', 'step-1', 'Story 1', '["passes all tests", "no lint errors"]')`);

        // Seed events
        db.exec(`INSERT INTO events (run_id, step_id, event_type) VALUES ('run-a', 'step-1', 'step_started')`);
        db.exec(`INSERT INTO events (run_id, step_id, event_type) VALUES ('run-a', 'step-1', 'step_completed')`);
        db.exec(`INSERT INTO events (run_id, event_type) VALUES ('run-b', 'run_started')`);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("getRuns returns all runs unfiltered", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getRuns();
        expect(result.total).toBe(3);
        expect(result.data).toHaveLength(3);
    });

    it("getRuns filters by workflow", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getRuns({ workflow: "wf1" });
        expect(result.total).toBe(2);
        expect(result.data.every(r => r.workflow === "wf1")).toBe(true);
    });

    it("getRuns filters by status", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getRuns({ status: "done" });
        expect(result.total).toBe(1);
        expect(result.data[0].id).toBe("run-a");
    });

    it("getRuns filters by search (task LIKE)", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getRuns({ search: "tests" });
        expect(result.total).toBe(1);
        expect(result.data[0].id).toBe("run-b");
    });

    it("getRuns paginates with limit/offset", () => {
        const mod = new DatabaseModule(makeConfig());
        const page1 = mod.getRuns({ limit: 2, offset: 0 });
        expect(page1.data).toHaveLength(2);
        const page2 = mod.getRuns({ limit: 2, offset: 2 });
        expect(page2.data).toHaveLength(1);
    });

    it("getRun returns run with steps and progress counters", () => {
        const mod = new DatabaseModule(makeConfig());
        const run = mod.getRun("run-a");
        expect(run).not.toBeNull();
        expect(run!.id).toBe("run-a");
        expect(run!.steps).toHaveLength(2);
        expect(run!.progress.total).toBe(2);
        expect(run!.progress.completed).toBe(2);
        expect(run!.progress.failed).toBe(0);
        expect(run!.progress.running).toBe(0);
    });

    it("getRun returns null for missing run", () => {
        const mod = new DatabaseModule(makeConfig());
        const run = mod.getRun("nonexistent");
        expect(run).toBeNull();
    });

    it("getSteps returns steps for a run", () => {
        const mod = new DatabaseModule(makeConfig());
        const steps = mod.getSteps("run-a");
        expect(steps).toHaveLength(2);
        expect(steps.map(s => s.id)).toContain("step-1");
    });

    it("getStep returns step with parsedOutput", () => {
        const mod = new DatabaseModule(makeConfig());
        const step = mod.getStep("step-1");
        expect(step).not.toBeNull();
        expect(step!.id).toBe("step-1");
        expect(step!.parsedOutput).toEqual({ status: "done", branch: "main" });
    });

    it("getStep returns null for missing step", () => {
        const mod = new DatabaseModule(makeConfig());
        const step = mod.getStep("nonexistent");
        expect(step).toBeNull();
    });

    it("getStories parses acceptanceCriteria JSON array", () => {
        const mod = new DatabaseModule(makeConfig());
        const stories = mod.getStories("step-1");
        expect(stories).toHaveLength(1);
        expect(Array.isArray(stories[0].acceptanceCriteria)).toBe(true);
        expect(stories[0].acceptanceCriteria).toContain("passes all tests");
    });

    it("getEvents returns all events unfiltered", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getEvents();
        expect(result.total).toBe(3);
    });

    it("getEvents filters by runId", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getEvents({ runId: "run-a" });
        expect(result.total).toBe(2);
    });

    it("getEvents filters by stepId", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getEvents({ stepId: "step-1" });
        expect(result.total).toBe(2);
    });

    it("getEvents filters by eventType", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getEvents({ eventType: "run_started" });
        expect(result.total).toBe(1);
    });

    it("getEvents paginates", () => {
        const mod = new DatabaseModule(makeConfig());
        const page = mod.getEvents({ limit: 1, offset: 0 });
        expect(page.data).toHaveLength(1);
        expect(page.total).toBe(3);
    });

    it("getStats returns correct counts", () => {
        const mod = new DatabaseModule(makeConfig());
        const stats = mod.getStats();
        expect(stats.totalRuns).toBe(3);
        expect(stats.activeRuns).toBe(1); // run-b is running
        expect(stats.completedRuns).toBe(1); // run-a is done
        expect(stats.failedRuns).toBe(1); // run-c is failed
        expect(stats.totalSteps).toBe(3);
    });

    it("getRuns uses camelCase field mapping via snakeToCamel", () => {
        const mod = new DatabaseModule(makeConfig());
        const result = mod.getRuns({ status: "done" });
        const run = result.data[0];
        // createdAt should be camelCased from created_at
        expect(run).toHaveProperty("createdAt");
    });
});
