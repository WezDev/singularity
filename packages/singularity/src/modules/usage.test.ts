import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UsageModule } from "./usage.js";
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
`;

let tmpDir: string;
let dbPath: string;
let db: DatabaseSync;

function makeConfig(path?: string): ResolvedSDKConfig {
    return {
        gatewayUrl: "http://localhost:3000",
        cliBinary: "openclaw",
        dbPath: path ?? dbPath,
        configPath: "/tmp/config.json",
        cronStorePath: "/tmp/cron.json",
        skillsDir: "/tmp/skills",
        agentsBaseDir: "/tmp/agents",
        workflowsDir: "/tmp/workflows",
    };
}

describe("UsageModule", () => {
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "singularity-usage-"));
        dbPath = join(tmpDir, "test.db");
        db = new DatabaseSync(dbPath);
        db.exec("PRAGMA journal_mode=WAL");
        db.exec(SCHEMA_SQL);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("summary returns empty when DB file does not exist", async () => {
        // Note: UsageModule.hasStepsTable() catches errors from getDb() and returns false,
        // so summary() returns an empty result rather than throwing when DB is missing.
        const mod = new UsageModule(makeConfig(join(tmpDir, "nonexistent.db")));
        const result = await mod.summary();
        expect(result.totalInputTokens).toBe(0);
        expect(result.totalOutputTokens).toBe(0);
        expect(result.estimatedCostUsd).toBe(0);
    });

    it("summary returns zeros with empty steps table", async () => {
        const mod = new UsageModule(makeConfig());
        const result = await mod.summary();
        expect(result.totalInputTokens).toBe(0);
        expect(result.totalOutputTokens).toBe(0);
        expect(result.totalTokens).toBe(0);
        expect(result.estimatedCostUsd).toBe(0);
    });

    it("summary aggregates token counts and estimates cost", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s1', 'r1', 'code', 'coder', 1000, 500, 'claude-sonnet-4-6')`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.summary();
        expect(result.totalInputTokens).toBe(1000);
        expect(result.totalOutputTokens).toBe(500);
        expect(result.totalTokens).toBe(1500);
        expect(result.estimatedCostUsd).toBeGreaterThan(0);
    });

    it("byModel groups usage by model", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s1', 'r1', 'code', 'coder', 100, 50, 'claude-opus-4-6')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s2', 'r1', 'review', 'coder', 200, 80, 'claude-sonnet-4-6')`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byModel();
        expect(result).toHaveLength(2);
        const models = result.map(r => r.model);
        expect(models).toContain("claude-opus-4-6");
        expect(models).toContain("claude-sonnet-4-6");
    });

    it("byAgent groups usage by agent", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens)
                 VALUES ('s1', 'r1', 'code', 'agent-a', 100, 50)`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens)
                 VALUES ('s2', 'r1', 'code', 'agent-b', 200, 80)`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byAgent();
        expect(result).toHaveLength(2);
        expect(result.map(r => r.agentId)).toContain("agent-a");
    });

    it("byRun groups usage by run", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task1'), ('r2', 'wf', 'task2')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens)
                 VALUES ('s1', 'r1', 'code', 'coder', 100, 50)`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens)
                 VALUES ('s2', 'r2', 'code', 'coder', 200, 80)`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byRun();
        expect(result).toHaveLength(2);
    });

    it("byStep returns usage for specific run", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s1', 'r1', 'code', 'coder', 500, 250, 'claude-haiku-4-5-20251001')`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byStep("r1");
        expect(result).toHaveLength(1);
        expect(result[0].stepId).toBe("s1");
        expect(result[0].inputTokens).toBe(500);
        expect(result[0].estimatedCostUsd).toBeGreaterThan(0);
    });

    it("estimateCost uses known model pricing (opus/sonnet/haiku)", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        // opus: input=15/1M, output=75/1M
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s1', 'r1', 'code', 'coder', 1000000, 0, 'claude-opus-4-6')`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byStep("r1");
        expect(result[0].estimatedCostUsd).toBeCloseTo(15, 5);
    });

    it("estimateCost falls back for unknown model", async () => {
        db.exec(`INSERT INTO runs (id, workflow, task) VALUES ('r1', 'wf', 'task')`);
        // fallback: input=3/1M, output=15/1M
        db.exec(`INSERT INTO steps (id, run_id, step_name, agent_id, input_tokens, output_tokens, model)
                 VALUES ('s1', 'r1', 'code', 'coder', 1000000, 0, 'unknown-model')`);
        const mod = new UsageModule(makeConfig());
        const result = await mod.byStep("r1");
        expect(result[0].estimatedCostUsd).toBeCloseTo(3, 5);
    });
});
