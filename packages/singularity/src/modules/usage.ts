import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { existsSync } from "node:fs";
import type { ResolvedSDKConfig, UsageQuery, UsageSummary, UsageByModel, UsageByAgent, UsageByRun, UsageByStep } from "../types.js";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};

function estimateCost(model: string | null, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[model ?? ""] ?? { input: 3 / 1_000_000, output: 15 / 1_000_000 };
    return inputTokens * costs.input + outputTokens * costs.output;
}

export class UsageModule {
    private db: DatabaseSync | null = null;

    constructor(private config: ResolvedSDKConfig) {}

    private getDb(): DatabaseSync {
        if (!this.db) {
            if (!existsSync(this.config.dbPath)) {
                throw new Error(`Database not found at ${this.config.dbPath}`);
            }
            this.db = new DatabaseSync(this.config.dbPath);
            this.db.exec("PRAGMA journal_mode=WAL");
        }
        return this.db;
    }

    private hasStepsTable(): boolean {
        try {
            const row = this.getDb().prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='steps'"
            ).get() as Record<string, unknown> | undefined;
            return !!row;
        } catch {
            return false;
        }
    }

    async summary(params: UsageQuery = {}): Promise<UsageSummary> {
        if (!this.hasStepsTable()) {
            return emptyUsageSummary(params);
        }

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const row = db.prepare(`
            SELECT
                COALESCE(SUM(s.input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(s.output_tokens), 0) as total_output_tokens,
                COUNT(*) as session_count
            FROM steps s
            LEFT JOIN runs r ON s.run_id = r.id
            ${where}
        `).get(...values) as Record<string, unknown>;

        const inputTokens = Number(row.total_input_tokens);
        const outputTokens = Number(row.total_output_tokens);

        return {
            totalInputTokens: inputTokens,
            totalOutputTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimatedCostUsd: estimateCost(null, inputTokens, outputTokens),
            period: this.getPeriod(params),
            sessionCount: Number(row.session_count),
        };
    }

    async byModel(params: UsageQuery = {}): Promise<UsageByModel[]> {
        if (!this.hasStepsTable()) return [];

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                COALESCE(s.model, 'unknown') as model,
                COALESCE(SUM(s.input_tokens), 0) as input_tokens,
                COALESCE(SUM(s.output_tokens), 0) as output_tokens,
                COUNT(*) as session_count
            FROM steps s
            LEFT JOIN runs r ON s.run_id = r.id
            ${where}
            GROUP BY s.model
        `).all(...values) as Record<string, unknown>[];

        return rows.map(row => {
            const model = String(row.model);
            const inputTokens = Number(row.input_tokens);
            const outputTokens = Number(row.output_tokens);
            return {
                model,
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
                sessionCount: Number(row.session_count),
            };
        });
    }

    async byAgent(params: UsageQuery = {}): Promise<UsageByAgent[]> {
        if (!this.hasStepsTable()) return [];

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                s.agent_id,
                COALESCE(SUM(s.input_tokens), 0) as input_tokens,
                COALESCE(SUM(s.output_tokens), 0) as output_tokens,
                COUNT(*) as session_count
            FROM steps s
            LEFT JOIN runs r ON s.run_id = r.id
            ${where}
            GROUP BY s.agent_id
        `).all(...values) as Record<string, unknown>[];

        return rows.map(row => {
            const inputTokens = Number(row.input_tokens);
            const outputTokens = Number(row.output_tokens);
            return {
                agentId: String(row.agent_id),
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCostUsd: estimateCost(null, inputTokens, outputTokens),
                sessionCount: Number(row.session_count),
            };
        });
    }

    async byRun(params: UsageQuery = {}): Promise<UsageByRun[]> {
        if (!this.hasStepsTable()) return [];

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                r.id as run_id,
                r.workflow,
                r.task,
                COALESCE(SUM(s.input_tokens), 0) as input_tokens,
                COALESCE(SUM(s.output_tokens), 0) as output_tokens,
                COUNT(*) as step_count
            FROM steps s
            JOIN runs r ON s.run_id = r.id
            ${where}
            GROUP BY r.id
            ORDER BY r.created_at DESC
        `).all(...values) as Record<string, unknown>[];

        return rows.map(row => {
            const inputTokens = Number(row.input_tokens);
            const outputTokens = Number(row.output_tokens);
            return {
                runId: String(row.run_id),
                workflow: String(row.workflow),
                task: String(row.task),
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCostUsd: estimateCost(null, inputTokens, outputTokens),
                stepCount: Number(row.step_count),
            };
        });
    }

    async byStep(runId: string): Promise<UsageByStep[]> {
        if (!this.hasStepsTable()) return [];

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                id as step_id,
                step_name,
                agent_id,
                model,
                COALESCE(input_tokens, 0) as input_tokens,
                COALESCE(output_tokens, 0) as output_tokens
            FROM steps
            WHERE run_id = ?
            ORDER BY created_at ASC
        `).all(runId) as Record<string, unknown>[];

        return rows.map(row => {
            const inputTokens = Number(row.input_tokens);
            const outputTokens = Number(row.output_tokens);
            const model = row.model as string | null;
            return {
                stepId: String(row.step_id),
                stepName: String(row.step_name),
                agentId: String(row.agent_id),
                model,
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
            };
        });
    }

    private buildFilter(params: UsageQuery): { conditions: string[]; values: SQLInputValue[] } {
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (params.model) { conditions.push("s.model = ?"); values.push(params.model); }
        if (params.agentId) { conditions.push("s.agent_id = ?"); values.push(params.agentId); }
        if (params.runId) { conditions.push("s.run_id = ?"); values.push(params.runId); }
        if (params.from) { conditions.push("s.created_at >= ?"); values.push(params.from); }
        if (params.to) { conditions.push("s.created_at <= ?"); values.push(params.to); }
        if (params.days) {
            const from = new Date(Date.now() - params.days * 86400000).toISOString();
            conditions.push("s.created_at >= ?"); values.push(from);
        }

        return { conditions, values };
    }

    private getPeriod(params: UsageQuery): { from: string; to: string } {
        const to = params.to ?? new Date().toISOString();
        const from = params.from ?? new Date(Date.now() - (params.days ?? 30) * 86400000).toISOString();
        return { from, to };
    }
}

function emptyUsageSummary(params: UsageQuery): UsageSummary {
    const to = params.to ?? new Date().toISOString();
    const from = params.from ?? new Date(Date.now() - (params.days ?? 30) * 86400000).toISOString();
    return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        period: { from, to },
        sessionCount: 0,
    };
}
