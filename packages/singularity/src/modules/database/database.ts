import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { existsSync } from "node:fs";
import type {
    ResolvedSDKConfig, Run, RunDetail, Step, StepDetail, Story,
    Event, DashboardStats, PaginatedResult, RunsQuery, EventsQuery,
} from "../types.js";
import { snakeToCamel, parseJsonColumn, parseStepOutput } from "../utils.js";

export class DatabaseModule {
    private db: DatabaseSync | null = null;

    constructor(private config: ResolvedSDKConfig) {}

    private getDb(): DatabaseSync {
        if (!this.db) {
            if (!existsSync(this.config.dbPath)) {
                throw new Error(`Database not found at ${this.config.dbPath}. Run 'singularity install' first.`);
            }
            this.db = new DatabaseSync(this.config.dbPath);
            this.db.exec("PRAGMA journal_mode=WAL");
        }
        return this.db;
    }

    query<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T[] {
        const stmt = this.getDb().prepare(sql);
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return rows.map(row => snakeToCamel<T>(row));
    }

    queryOne<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T | null {
        const stmt = this.getDb().prepare(sql);
        const row = stmt.get(...params) as Record<string, unknown> | undefined;
        if (!row) return null;
        return snakeToCamel<T>(row);
    }

    getRuns(params: RunsQuery = {}): PaginatedResult<Run> {
        const { workflow, status, search, limit = 50, offset = 0 } = params;
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (workflow) { conditions.push("workflow = ?"); values.push(workflow); }
        if (status) { conditions.push("status = ?"); values.push(status); }
        if (search) { conditions.push("task LIKE ?"); values.push(`%${search}%`); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const total = this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM runs ${where}`, values
        )!.count;

        const data = this.query<Run>(
            `SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...values, limit, offset]
        );

        return { data, total, limit, offset };
    }

    getRun(runId: string): RunDetail | null {
        const run = this.queryOne<Run>(
            "SELECT * FROM runs WHERE id = ? OR id LIKE ?",
            [runId, `${runId}%`]
        );
        if (!run) return null;

        const steps = this.getSteps(run.id);
        return {
            ...run,
            steps,
            progress: {
                total: steps.length,
                completed: steps.filter(s => s.status === "done").length,
                failed: steps.filter(s => s.status === "failed").length,
                running: steps.filter(s => s.status === "running").length,
                pending: steps.filter(s => ["pending", "ready"].includes(s.status)).length,
            },
        };
    }

    getSteps(runId: string): Step[] {
        return this.query<Step>(
            "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC",
            [runId]
        );
    }

    getStep(stepId: string): StepDetail | null {
        const step = this.queryOne<Step>(
            "SELECT * FROM steps WHERE id = ? OR id LIKE ?",
            [stepId, `${stepId}%`]
        );
        if (!step) return null;

        const stories = this.getStories(step.id);
        return {
            ...step,
            stories: stories.length > 0 ? stories : undefined,
            parsedOutput: parseStepOutput(step.output),
        };
    }

    getStories(stepId: string): Story[] {
        const rows = this.query<Story & { acceptanceCriteria: string | null }>(
            "SELECT * FROM stories WHERE step_id = ? ORDER BY created_at ASC",
            [stepId]
        );
        return rows.map(row => ({
            ...row,
            acceptanceCriteria: typeof row.acceptanceCriteria === "string"
                ? parseJsonColumn<string[]>(row.acceptanceCriteria)
                : row.acceptanceCriteria,
        })) as Story[];
    }

    getEvents(params: EventsQuery = {}): PaginatedResult<Event> {
        const { runId, stepId, eventType, limit = 50, offset = 0 } = params;
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (runId) { conditions.push("run_id = ?"); values.push(runId); }
        if (stepId) { conditions.push("step_id = ?"); values.push(stepId); }
        if (eventType) { conditions.push("event_type = ?"); values.push(eventType); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const total = this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM events ${where}`, values
        )!.count;

        const data = this.query<Event>(
            `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...values, limit, offset]
        );

        return { data, total, limit, offset };
    }

    getStats(): DashboardStats {
        const d24h = new Date(Date.now() - 86400000).toISOString();
        const d7d = new Date(Date.now() - 604800000).toISOString();

        return {
            totalRuns: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs")!.c,
            activeRuns: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs WHERE status = 'running'")!.c,
            completedRuns: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs WHERE status = 'done'")!.c,
            failedRuns: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs WHERE status = 'failed'")!.c,
            totalSteps: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM steps")!.c,
            avgStepsPerRun: this.queryOne<{ c: number }>("SELECT AVG(cnt) as c FROM (SELECT COUNT(*) as cnt FROM steps GROUP BY run_id)")?.c ?? 0,
            runsLast24h: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs WHERE created_at >= ?", [d24h])!.c,
            runsLast7d: this.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM runs WHERE created_at >= ?", [d7d])!.c,
        };
    }
}
