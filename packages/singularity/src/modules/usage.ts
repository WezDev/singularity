import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { existsSync } from "node:fs";
import type { ResolvedSDKConfig, UsageQuery, UsageSummary, UsageByModel, UsageByAgent } from "../types.js";
import { snakeToCamel } from "../utils.js";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[model] ?? { input: 3 / 1_000_000, output: 15 / 1_000_000 };
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

    private hasUsageTable(): boolean {
        try {
            const row = this.getDb().prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='usage'"
            ).get() as Record<string, unknown> | undefined;
            return !!row;
        } catch {
            return false;
        }
    }

    async summary(params: UsageQuery = {}): Promise<UsageSummary> {
        if (!this.hasUsageTable()) {
            return emptyUsageSummary(params);
        }

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const row = db.prepare(`
            SELECT
                COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                COUNT(*) as session_count
            FROM usage ${where}
        `).get(...values) as Record<string, unknown>;

        const inputTokens = Number(row.total_input_tokens);
        const outputTokens = Number(row.total_output_tokens);

        return {
            totalInputTokens: inputTokens,
            totalOutputTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimatedCostUsd: estimateCost("claude-sonnet-4-6", inputTokens, outputTokens),
            period: this.getPeriod(params),
            sessionCount: Number(row.session_count),
        };
    }

    async byModel(params: UsageQuery = {}): Promise<UsageByModel[]> {
        if (!this.hasUsageTable()) return [];

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                model,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COUNT(*) as session_count
            FROM usage ${where}
            GROUP BY model
        `).all(...values) as Record<string, unknown>[];

        return rows.map(row => {
            const r = snakeToCamel<UsageByModel>(row);
            r.totalTokens = r.inputTokens + r.outputTokens;
            r.estimatedCostUsd = estimateCost(r.model, r.inputTokens, r.outputTokens);
            return r;
        });
    }

    async byAgent(params: UsageQuery = {}): Promise<UsageByAgent[]> {
        if (!this.hasUsageTable()) return [];

        const { conditions, values } = this.buildFilter(params);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const db = this.getDb();
        const rows = db.prepare(`
            SELECT
                agent_id,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COUNT(*) as session_count
            FROM usage ${where}
            GROUP BY agent_id
        `).all(...values) as Record<string, unknown>[];

        return rows.map(row => {
            const r = snakeToCamel<UsageByAgent>(row);
            r.totalTokens = r.inputTokens + r.outputTokens;
            r.estimatedCostUsd = estimateCost("claude-sonnet-4-6", r.inputTokens, r.outputTokens);
            return r;
        });
    }

    private buildFilter(params: UsageQuery): { conditions: string[]; values: SQLInputValue[] } {
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (params.model) { conditions.push("model = ?"); values.push(params.model); }
        if (params.agentId) { conditions.push("agent_id = ?"); values.push(params.agentId); }
        if (params.from) { conditions.push("created_at >= ?"); values.push(params.from); }
        if (params.to) { conditions.push("created_at <= ?"); values.push(params.to); }
        if (params.days) {
            const from = new Date(Date.now() - params.days * 86400000).toISOString();
            conditions.push("created_at >= ?"); values.push(from);
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
