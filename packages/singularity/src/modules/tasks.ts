import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { existsSync } from "node:fs";
import type {
    ResolvedSDKConfig, Run, RunDetail, Step, StepDetail, Story,
    PaginatedResult, RunsQuery, CreateTaskParams, UpdateTaskParams, UpdateSubtaskParams,
} from "../types.js";
import { snakeToCamel, parseJsonColumn, parseStepOutput } from "../utils.js";
import { NotFoundError } from "../errors.js";
import type { WorkflowsModule } from "./workflows.js";

function mapRunStatus(run: Run): Run {
    if (run.status as string === "running") {
        const isScheduled = run.scheduledAt && new Date(run.scheduledAt) > new Date();
        return { ...run, status: isScheduled ? "scheduled" : "ready" };
    }
    return run;
}

export class TasksModule {
    private db: DatabaseSync | null = null;

    constructor(
        private config: ResolvedSDKConfig,
        private workflows: WorkflowsModule,
    ) {}

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

    private query<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T[] {
        const stmt = this.getDb().prepare(sql);
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return rows.map(row => snakeToCamel<T>(row));
    }

    private queryOne<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T | null {
        const stmt = this.getDb().prepare(sql);
        const row = stmt.get(...params) as Record<string, unknown> | undefined;
        if (!row) return null;
        return snakeToCamel<T>(row);
    }

    private exec(sql: string, params: SQLInputValue[] = []): void {
        this.getDb().prepare(sql).run(...params);
    }

    private insertEvent(runId: string | null, stepId: string | null, eventType: string, details?: Record<string, unknown>): void {
        this.exec(
            "INSERT INTO events (run_id, step_id, event_type, details) VALUES (?, ?, ?, ?)",
            [runId, stepId, eventType, details ? JSON.stringify(details) : null],
        );
    }

    // --- Runs (Tasks) ---

    async list(query: RunsQuery = {}): Promise<PaginatedResult<RunDetail>> {
        const { workflow, status, search, limit = 50, offset = 0 } = query;
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (workflow) { conditions.push("workflow = ?"); values.push(workflow); }
        if (status) {
            // "ready" and "scheduled" both map to "running" in the DB
            if (status === "ready" || status === "scheduled") {
                conditions.push("status = 'running'");
            } else {
                conditions.push("status = ?"); values.push(status);
            }
        }
        if (search) { conditions.push("task LIKE ?"); values.push(`%${search}%`); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const total = this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM runs ${where}`, values
        )!.count;

        const runs = this.query<Run>(
            `SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...values, limit, offset],
        ).map(mapRunStatus);

        // Post-filter: if caller asked for "ready" or "scheduled", exclude the other
        let filtered = runs;
        if (status === "ready") {
            filtered = runs.filter(r => r.status === "ready");
        } else if (status === "scheduled") {
            filtered = runs.filter(r => r.status === "scheduled");
        }

        // Hydrate each run with steps + progress
        const data = filtered.map(run => {
            const steps = this.query<Step>(
                "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC",
                [run.id],
            );
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
        });

        return { data, total, limit, offset };
    }

    async get(taskId: string): Promise<RunDetail> {
        const raw = this.queryOne<Run>(
            "SELECT * FROM runs WHERE id = ? OR id LIKE ?",
            [taskId, `${taskId}%`],
        );
        if (!raw) throw new NotFoundError("Task", taskId);

        const run = mapRunStatus(raw);
        const steps = this.query<Step>(
            "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC",
            [run.id],
        );

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

    async create(params: CreateTaskParams): Promise<RunDetail> {
        const spec = await this.workflows.get(params.workflowId);
        const db = this.getDb();
        const runId = randomUUID();

        // Resolve the run template
        let runTemplate;
        if (params.runId) {
            runTemplate = spec.runs.find(r => r.id === params.runId);
            if (!runTemplate) {
                throw new Error(`Run template '${params.runId}' not found. Available: ${spec.runs.map(r => r.id).join(", ")}`);
            }
        } else if (spec.runs.length === 1) {
            runTemplate = spec.runs[0];
        } else {
            throw new Error(`Workflow '${params.workflowId}' has multiple run templates. Specify runId. Available: ${spec.runs.map(r => r.id).join(", ")}`);
        }

        db.prepare(
            "INSERT INTO runs (id, workflow, task, status, run_spec, scheduled_at) VALUES (?, ?, ?, 'running', ?, ?)",
        ).run(runId, spec.id, params.task, runTemplate.id, params.scheduledAt ?? null);

        for (let i = 0; i < runTemplate.steps.length; i++) {
            const step = runTemplate.steps[i];
            const stepId = randomUUID();
            const status = i === 0 ? "ready" : "pending";
            const agentId = `${spec.id}_${step.agent}`;
            const maxRetries = step.onFail?.maxRetries ?? step.maxRetries ?? 2;

            db.prepare(
                "INSERT INTO steps (id, run_id, step_name, agent_id, status, input, max_retries) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ).run(stepId, runId, step.id, agentId, status, step.input, maxRetries);
        }

        this.insertEvent(runId, null, "run.created", {
            workflow: spec.id,
            runSpec: runTemplate.id,
            task: params.task,
            scheduledAt: params.scheduledAt ?? null,
        });

        return this.get(runId);
    }

    async update(taskId: string, params: UpdateTaskParams): Promise<RunDetail> {
        const run = this.queryOne<Run>(
            "SELECT * FROM runs WHERE id = ? OR id LIKE ?",
            [taskId, `${taskId}%`],
        );
        if (!run) throw new NotFoundError("Task", taskId);

        if (params.status === "stopped") {
            this.exec(
                "UPDATE runs SET status = 'stopped', completed_at = datetime('now') WHERE id = ?",
                [run.id],
            );
            this.exec(
                "UPDATE steps SET status = 'stopped' WHERE run_id = ? AND status IN ('running', 'ready')",
                [run.id],
            );
            this.insertEvent(run.id, null, "run.stopped");
        } else if (params.status === "ready") {
            // Resume: find first failed step and re-ready it
            const failedStep = this.queryOne<Step>(
                "SELECT * FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY created_at ASC LIMIT 1",
                [run.id],
            );
            if (failedStep) {
                this.exec("UPDATE steps SET status = 'ready', retry_count = 0 WHERE id = ?", [failedStep.id]);
            }
            // DB stores "running" — SDK maps it to "ready"/"scheduled" on read
            this.exec("UPDATE runs SET status = 'running' WHERE id = ?", [run.id]);
            this.insertEvent(run.id, failedStep?.id ?? null, "run.resumed");
        }

        return this.get(run.id);
    }

    async delete(taskId: string): Promise<void> {
        const run = this.queryOne<Run>(
            "SELECT * FROM runs WHERE id = ? OR id LIKE ?",
            [taskId, `${taskId}%`],
        );
        if (!run) throw new NotFoundError("Task", taskId);

        // Cascade: events → stories → steps → run
        this.exec("DELETE FROM events WHERE run_id = ?", [run.id]);

        const steps = this.query<Step>(
            "SELECT id FROM steps WHERE run_id = ?", [run.id],
        );
        for (const step of steps) {
            this.exec("DELETE FROM stories WHERE step_id = ?", [step.id]);
        }

        this.exec("DELETE FROM steps WHERE run_id = ?", [run.id]);
        this.exec("DELETE FROM runs WHERE id = ?", [run.id]);
    }

    // --- Steps (Subtasks) ---

    async listSubtasks(taskId: string): Promise<Step[]> {
        const run = this.queryOne<Run>(
            "SELECT * FROM runs WHERE id = ? OR id LIKE ?",
            [taskId, `${taskId}%`],
        );
        if (!run) throw new NotFoundError("Task", taskId);

        return this.query<Step>(
            "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC",
            [run.id],
        );
    }

    async getSubtask(subtaskId: string): Promise<StepDetail> {
        const step = this.queryOne<Step>(
            "SELECT * FROM steps WHERE id = ? OR id LIKE ?",
            [subtaskId, `${subtaskId}%`],
        );
        if (!step) throw new NotFoundError("Subtask", subtaskId);

        const stories = this.query<Story & { acceptanceCriteria: string | null }>(
            "SELECT * FROM stories WHERE step_id = ? ORDER BY created_at ASC",
            [step.id],
        );

        return {
            ...step,
            stories: stories.length > 0
                ? stories.map(s => ({
                    ...s,
                    acceptanceCriteria: typeof s.acceptanceCriteria === "string"
                        ? parseJsonColumn<string[]>(s.acceptanceCriteria)
                        : s.acceptanceCriteria,
                })) as Story[]
                : undefined,
            parsedOutput: parseStepOutput(step.output),
        };
    }

    async updateSubtask(subtaskId: string, params: UpdateSubtaskParams): Promise<StepDetail> {
        const step = this.queryOne<Step>(
            "SELECT * FROM steps WHERE id = ? OR id LIKE ?",
            [subtaskId, `${subtaskId}%`],
        );
        if (!step) throw new NotFoundError("Subtask", subtaskId);

        if (params.status) {
            this.exec("UPDATE steps SET status = ? WHERE id = ?", [params.status, step.id]);
        }

        return this.getSubtask(step.id);
    }
}
