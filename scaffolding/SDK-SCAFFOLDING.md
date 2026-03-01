# SDK Scaffolding Guide — OpenClaw Dashboard SDK

## Overview

This SDK is a class-based TypeScript package consumed as a private `file:` dependency in a Next.js dashboard app. It runs **server-side only** (API routes, server actions, server components). All return types should be plain serializable objects (no class instances, no SQLite handles, no functions) so they can be safely passed to client components or serialized across the network.

The SDK talks to OpenClaw via a mix of **CLI wrappers** (`child_process.execFileSync` / `execFile`) and **HTTP calls** to the gateway at `http://127.0.0.1:18789`. Some modules also read directly from the local filesystem and SQLite database.

---

## Top-Level API Design

The SDK exports a single factory function that returns a configured client instance with all modules attached.

```typescript
import { createOpenClawSDK } from "openclaw-sdk";

const sdk = createOpenClawSDK({
    gatewayUrl: "http://127.0.0.1:18789",   // optional, defaults to this
    dbPath: "~/.openclaw/<tool-name>/state.db", // optional, for the database module
    configPath: "~/.openclaw/openclaw.json",   // optional
});

// Usage
const agents = await sdk.agents.list();
const run = await sdk.activity.get("a1fdf573");
const usage = await sdk.usage.summary({ model: "claude-opus-4-6", days: 7 });
```

---

## Package Structure

```
openclaw-sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # createOpenClawSDK factory + re-exports
│   ├── types.ts                 # All shared types and return shapes
│   ├── client.ts                # OpenClawSDK class — assembles all modules
│   ├── transport/
│   │   ├── cli.ts               # CLI wrapper helpers (execFile / execFileSync)
│   │   └── http.ts              # HTTP helpers (fetch to gateway)
│   └── modules/
│       ├── agents.ts            # sdk.agents.*
│       ├── cron.ts              # sdk.cron.*
│       ├── usage.ts             # sdk.usage.*
│       ├── database.ts          # sdk.database.*
│       ├── activity.ts          # sdk.activity.*
│       ├── config.ts            # sdk.config.*
│       └── skills.ts            # sdk.skills.*
```

---

## Core Classes

### Factory (index.ts)

```typescript
export interface SDKConfig {
    gatewayUrl?: string;          // default: "http://127.0.0.1:18789"
    dbPath?: string;              // default: "~/.openclaw/<tool-name>/state.db"
    configPath?: string;          // default: "~/.openclaw/openclaw.json"
    cronStorePath?: string;       // default: "~/.openclaw/cron/jobs.json"
    skillsDir?: string;           // default: "~/.openclaw/workspace/skills"
}

export function createOpenClawSDK(config?: SDKConfig): OpenClawSDK;
```

### Client (client.ts)

```typescript
import { AgentsModule } from "./modules/agents";
import { CronModule } from "./modules/cron";
import { UsageModule } from "./modules/usage";
import { DatabaseModule } from "./modules/database";
import { ActivityModule } from "./modules/activity";
import { ConfigModule } from "./modules/config";
import { SkillsModule } from "./modules/skills";

export class OpenClawSDK {
    public readonly agents: AgentsModule;
    public readonly cron: CronModule;
    public readonly usage: UsageModule;
    public readonly database: DatabaseModule;
    public readonly activity: ActivityModule;
    public readonly config: ConfigModule;
    public readonly skills: SkillsModule;

    constructor(private config: ResolvedSDKConfig) {
        const http = new HttpTransport(config.gatewayUrl);
        const cli = new CliTransport();

        this.agents = new AgentsModule(http, cli, config);
        this.cron = new CronModule(http, cli, config);
        this.usage = new UsageModule(http, cli, config);
        this.database = new DatabaseModule(config);
        this.activity = new ActivityModule(config);
        this.config = new ConfigModule(config);
        this.skills = new SkillsModule(http, cli, config);
    }
}
```

Each module receives the transports it needs. Modules that only read local files (database, activity, config) don't need HTTP or CLI transports.

---

## Transport Layer

### HTTP Transport (transport/http.ts)

```typescript
export class HttpTransport {
    constructor(private baseUrl: string) {}

    async invoke(tool: string, action: string, payload?: Record<string, unknown>): Promise<unknown> {
        const res = await fetch(`${this.baseUrl}/tools/invoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool, action, payload }),
        });
        if (!res.ok) throw new SDKError(`Gateway error: ${res.status}`, { tool, action });
        return res.json();
    }

    async get(path: string): Promise<unknown> {
        const res = await fetch(`${this.baseUrl}${path}`);
        if (!res.ok) throw new SDKError(`Gateway GET error: ${res.status}`, { path });
        return res.json();
    }
}
```

### CLI Transport (transport/cli.ts)

```typescript
import { execFile } from "child_process/promises";

export class CliTransport {
    async run(args: string[]): Promise<string> {
        try {
            const { stdout } = await execFile("openclaw", args, {
                timeout: 30_000,
                maxBuffer: 1024 * 1024,
            });
            return stdout.trim();
        } catch (err) {
            throw new SDKError(`CLI error: openclaw ${args.join(" ")}`, { cause: err });
        }
    }

    async runJSON<T>(args: string[]): Promise<T> {
        const output = await this.run(args);
        return JSON.parse(output) as T;
    }
}
```

### Fallback Pattern

Most modules should try HTTP first and fall back to CLI. Extract this into a helper:

```typescript
export async function withFallback<T>(
    httpFn: () => Promise<T>,
    cliFn: () => Promise<T>,
): Promise<T> {
    try {
        return await httpFn();
    } catch (err) {
        if (isConnectionError(err)) {
            return await cliFn();
        }
        throw err;
    }
}
```

---

## Module Specifications

---

### sdk.agents

**Transport:** CLI primary (`openclaw agent` commands), HTTP secondary
**Source of truth:** `~/.openclaw/openclaw.json` agents array

#### Methods

```typescript
export class AgentsModule {

    /** Get a single agent by ID */
    async get(agentId: string): Promise<Agent>

    /** List all registered agents */
    async list(): Promise<Agent[]>

    /** Create a new agent */
    async create(params: CreateAgentParams): Promise<Agent>

    /** Delete an agent by ID */
    async delete(agentId: string): Promise<void>

    /** Update an agent's configuration */
    async update(agentId: string, params: UpdateAgentParams): Promise<Agent>
}
```

#### Types

```typescript
export interface Agent {
    id: string;
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
    isDefault?: boolean;
}

export interface CreateAgentParams {
    id: string;
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
}

export interface UpdateAgentParams {
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
}
```

#### Implementation Notes
- `list()` reads `openclaw.json` and parses the agents array, or uses the CLI `openclaw` command
- `create()` needs to both write to `openclaw.json` AND create the workspace directory
- `delete()` should remove from config AND optionally clean up the workspace
- `get()` filters from `list()` — there's no single-agent API endpoint in OpenClaw

---

### sdk.cron

**Transport:** HTTP primary (`cron.*` gateway API), CLI fallback (`openclaw cron` commands)
**Source of truth:** `~/.openclaw/cron/jobs.json` (managed by gateway)

#### Methods

```typescript
export class CronModule {

    /** Get a single cron job by jobId */
    async get(jobId: string): Promise<CronJob>

    /** List all cron jobs */
    async list(): Promise<CronJob[]>

    /** Create a new cron job */
    async create(params: CreateCronParams): Promise<CronJob>

    /** Delete a cron job */
    async delete(jobId: string): Promise<void>

    /**
     * Update a cron job.
     * Supports editing content (message, schedule) and toggling enabled/disabled.
     */
    async update(jobId: string, params: UpdateCronParams): Promise<CronJob>
}
```

#### Types

```typescript
export interface CronJob {
    jobId: string;
    name: string;
    enabled: boolean;
    schedule: CronSchedule;
    payload: CronPayload;
    agentId?: string;
    delivery?: CronDelivery;
    lastRun?: CronRunSummary;
    nextRunAt?: string;
}

export interface CronSchedule {
    kind: "cron" | "at" | "every";
    cron?: string;            // "*/15 * * * *"
    at?: string;              // ISO 8601 timestamp
    every?: number;           // milliseconds
    timezone?: string;
    staggerMs?: number;
}

export interface CronPayload {
    kind: "agentTurn" | "systemEvent";
    message?: string;
    model?: string;
    thinkingLevel?: string;
}

export interface CronDelivery {
    mode: "announce" | "webhook" | "none";
    channel?: string;
    to?: string;
    bestEffort?: boolean;
}

export interface CronRunSummary {
    status: "ok" | "error" | "skipped";
    startedAt: string;
    endedAt?: string;
    error?: string;
}

export interface CreateCronParams {
    name: string;
    schedule: CronSchedule;
    payload: CronPayload;
    agentId?: string;
    delivery?: CronDelivery;
    deleteAfterRun?: boolean;
}

export interface UpdateCronParams {
    name?: string;
    enabled?: boolean;          // toggle on/off without deleting
    schedule?: Partial<CronSchedule>;
    payload?: Partial<CronPayload>;
    agentId?: string;
    delivery?: CronDelivery;
}
```

#### Implementation Notes
- HTTP path: `http.invoke("cron", "add", params)` / `http.invoke("cron", "update", { jobId, ...params })`
- CLI fallback: `openclaw cron add --name ... --cron ...` / `openclaw cron edit <jobId> ...`
- `update()` with `{ enabled: false }` disables without deleting — maps to `openclaw cron edit <jobId> --disable`
- Run history is available via `cron.runs` gateway API — consider adding a `getRuns(jobId)` method
- Jobs are stored at `~/.openclaw/cron/jobs.json`, run logs at `~/.openclaw/cron/runs/<jobId>.jsonl`

---

### sdk.usage

**Transport:** CLI (`openclaw` usage output), HTTP (gateway status), and/or cron run logs
**Source of truth:** Varies — OpenClaw doesn't have a single usage API, so this aggregates from multiple sources

#### Methods

```typescript
export class UsageModule {

    /**
     * Get a usage summary with optional filters.
     * Aggregates token consumption across agent sessions.
     */
    async summary(params?: UsageQuery): Promise<UsageSummary>

    /**
     * Get usage broken down by model.
     */
    async byModel(params?: UsageQuery): Promise<UsageByModel[]>

    /**
     * Get usage broken down by agent.
     */
    async byAgent(params?: UsageQuery): Promise<UsageByAgent[]>
}
```

#### Types

```typescript
export interface UsageQuery {
    model?: string;             // filter to specific model
    agentId?: string;           // filter to specific agent
    days?: number;              // lookback window (default: 30)
    from?: string;              // ISO date
    to?: string;                // ISO date
}

export interface UsageSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    period: { from: string; to: string };
    sessionCount: number;
}

export interface UsageByModel {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    sessionCount: number;
}

export interface UsageByAgent {
    agentId: string;
    agentName?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    sessionCount: number;
}
```

#### Implementation Notes
- This is the trickiest module because OpenClaw doesn't have a clean usage API
- **Option A:** Parse cron run log JSONL files at `~/.openclaw/cron/runs/*.jsonl` — if they contain token data
- **Option B:** Read from your own SQLite database if you instrument your step complete/fail commands to capture token counts
- **Option C:** Query gateway WebSocket events for session completion data
- You may need to store usage data yourself in a `usage` table in your SQLite DB (see database module)
- Cost estimation: maintain a simple lookup table of per-token prices by model

---

### sdk.database

**Transport:** Direct SQLite via `node:sqlite`
**Source of truth:** `~/.openclaw/<tool-name>/state.db`

This module provides **read access** to the workflow orchestration database. The CLI writes to it (via step claim/complete/fail); the SDK reads from it for the dashboard.

#### Methods

```typescript
export class DatabaseModule {

    /** Run a raw SQL query. Returns plain objects. */
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]

    /** Run a raw SQL query that returns a single row. */
    queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null

    /** Get all runs, with optional filters and pagination */
    getRuns(params?: RunsQuery): PaginatedResult<Run>

    /** Get a single run with all its steps */
    getRun(runId: string): RunDetail | null

    /** Get all steps for a run */
    getSteps(runId: string): Step[]

    /** Get a single step */
    getStep(stepId: string): StepDetail | null

    /** Get stories for a loop step */
    getStories(stepId: string): Story[]

    /** Get events for a run (activity feed) */
    getEvents(params?: EventsQuery): PaginatedResult<Event>

    /** Get summary stats (for dashboard cards) */
    getStats(): DashboardStats
}
```

#### Types

```typescript
export interface RunsQuery {
    workflow?: string;
    status?: Run["status"];
    search?: string;            // search task description
    limit?: number;             // default: 50
    offset?: number;
}

export interface EventsQuery {
    runId?: string;
    stepId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    limit: number;
    offset: number;
}

export interface Run {
    id: string;
    workflow: string;
    task: string;
    status: "running" | "done" | "failed" | "stopped";
    createdAt: string;
    completedAt: string | null;
}

export interface RunDetail extends Run {
    steps: Step[];
    progress: {
        total: number;
        completed: number;
        failed: number;
        running: number;
        pending: number;
    };
}

export interface Step {
    id: string;
    runId: string;
    stepName: string;
    agentId: string;
    status: "pending" | "ready" | "running" | "done" | "failed" | "stopped";
    input: string | null;
    output: string | null;
    retryCount: number;
    maxRetries: number;
    createdAt: string;
    claimedAt: string | null;
    completedAt: string | null;
}

export interface StepDetail extends Step {
    stories?: Story[];
    parsedOutput?: Record<string, string>;  // KEY: value pairs parsed from output
}

export interface Story {
    id: string;
    stepId: string;
    title: string;
    description: string | null;
    acceptanceCriteria: string[] | null;
    status: "pending" | "running" | "done" | "failed";
    retryCount: number;
    maxRetries: number;
    output: string | null;
    createdAt: string;
    completedAt: string | null;
}

export interface Event {
    id: number;
    runId: string | null;
    stepId: string | null;
    eventType: string;
    details: Record<string, unknown> | null;
    createdAt: string;
}

export interface DashboardStats {
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
    totalSteps: number;
    avgStepsPerRun: number;
    runsLast24h: number;
    runsLast7d: number;
}
```

#### Implementation Notes

```typescript
import { DatabaseSync } from "node:sqlite";

export class DatabaseModule {
    private db: DatabaseSync;

    constructor(config: ResolvedSDKConfig) {
        this.db = new DatabaseSync(config.dbPath);
        this.db.exec("PRAGMA journal_mode=WAL");
    }

    query<T>(sql: string, params: unknown[] = []): T[] {
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        // Convert snake_case DB columns to camelCase for return types
        return rows.map(row => snakeToCamel(row)) as T[];
    }

    getRuns(params: RunsQuery = {}): PaginatedResult<Run> {
        const { workflow, status, search, limit = 50, offset = 0 } = params;
        const conditions: string[] = [];
        const values: unknown[] = [];

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

    getStats(): DashboardStats {
        const now = new Date().toISOString();
        const d24h = new Date(Date.now() - 86400000).toISOString();
        const d7d = new Date(Date.now() - 604800000).toISOString();

        return {
            totalRuns: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs")!.c,
            activeRuns: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs WHERE status = 'running'")!.c,
            completedRuns: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs WHERE status = 'done'")!.c,
            failedRuns: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs WHERE status = 'failed'")!.c,
            totalSteps: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM steps")!.c,
            avgStepsPerRun: this.queryOne<{c:number}>("SELECT AVG(cnt) as c FROM (SELECT COUNT(*) as cnt FROM steps GROUP BY run_id)")?.c ?? 0,
            runsLast24h: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs WHERE created_at >= ?", [d24h])!.c,
            runsLast7d: this.queryOne<{c:number}>("SELECT COUNT(*) as c FROM runs WHERE created_at >= ?", [d7d])!.c,
        };
    }
}
```

- **Always return camelCase** — the DB uses snake_case, the SDK should normalize to camelCase before returning
- **Support partial run IDs** — `getRun("a1fd")` should match `a1fdf573...` (use LIKE)
- **Parse JSON columns** — `acceptanceCriteria` is stored as JSON string, parse it before returning
- **Parse output KEY: value pairs** — `StepDetail.parsedOutput` should be the parsed version of the raw output string
- The `query()` method exposes raw SQL for the dashboard to do custom queries you haven't anticipated yet

---

### sdk.activity

**Transport:** Direct SQLite read (events table)
**Source of truth:** `events` table in `state.db`

This is a focused read-only view into the events table, designed for activity feeds and timelines in the dashboard.

#### Methods

```typescript
export class ActivityModule {

    /** Get a single event by ID */
    async get(eventId: number): Promise<Event | null>

    /** List events with filtering */
    async list(params?: ActivityQuery): Promise<PaginatedResult<ActivityEvent>>
}
```

#### Types

```typescript
export interface ActivityQuery {
    runId?: string;
    stepId?: string;
    eventType?: string;         // e.g. "step.completed", "run.created"
    limit?: number;
    offset?: number;
}

export interface ActivityEvent extends Event {
    // Enriched with context for display
    runTask?: string;           // the run's task description
    stepName?: string;          // the step name if step_id is present
    agentId?: string;           // which agent was involved
}
```

#### Implementation Notes

```typescript
export class ActivityModule {
    private db: DatabaseModule;

    constructor(config: ResolvedSDKConfig) {
        this.db = new DatabaseModule(config);
    }

    async list(params: ActivityQuery = {}): Promise<PaginatedResult<ActivityEvent>> {
        const { runId, stepId, eventType, limit = 50, offset = 0 } = params;
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (runId)     { conditions.push("e.run_id = ?"); values.push(runId); }
        if (stepId)    { conditions.push("e.step_id = ?"); values.push(stepId); }
        if (eventType) { conditions.push("e.event_type = ?"); values.push(eventType); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        // Join with runs and steps to enrich the event
        return this.db.query<ActivityEvent>(`
            SELECT e.*, r.task as run_task, s.step_name, s.agent_id
            FROM events e
            LEFT JOIN runs r ON e.run_id = r.id
            LEFT JOIN steps s ON e.step_id = s.id
            ${where}
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `, [...values, limit, offset]);
    }
}
```

- This module is thin — it's essentially a pre-built query layer on top of `database.query()`
- The enrichment (joining run task and step name) is the main value-add over raw queries
- Consider adding convenience methods later: `listForRun(runId)`, `listRecent(count)`

---

### sdk.config

**Transport:** Filesystem read/write of `~/.openclaw/openclaw.json`
**Source of truth:** `~/.openclaw/openclaw.json`

#### Methods

```typescript
export class ConfigModule {

    /** Read the full openclaw.json config */
    async get(): Promise<OpenClawConfig>

    /** Read a specific top-level key */
    async getKey<K extends keyof OpenClawConfig>(key: K): Promise<OpenClawConfig[K]>

    /** Update specific config keys (deep merge) */
    async update(patch: Partial<OpenClawConfig>): Promise<OpenClawConfig>
}
```

#### Types

```typescript
export interface OpenClawConfig {
    agent?: {
        model?: string;
        [key: string]: unknown;
    };
    agents?: AgentConfigEntry[];
    channels?: Record<string, unknown>;
    cron?: {
        enabled?: boolean;
        store?: string;
        maxConcurrentRuns?: number;
        [key: string]: unknown;
    };
    gateway?: Record<string, unknown>;
    browser?: Record<string, unknown>;
    [key: string]: unknown;       // don't constrain — config evolves fast
}

export interface AgentConfigEntry {
    id: string;
    workspace?: string;
    role?: string;
    model?: string;
    [key: string]: unknown;
}
```

#### Implementation Notes
- Read: `JSON.parse(fs.readFileSync(configPath, "utf-8"))`
- Write: read → deep merge → `fs.writeFileSync(configPath, JSON.stringify(merged, null, 2))`
- **Be careful with writes** — OpenClaw's gateway loads config into memory. Changes to `openclaw.json` may not take effect until gateway restart. Document this.
- Use a wide `[key: string]: unknown` index signature — OpenClaw's config surface is large and evolving. Don't try to type the whole thing.

---

### sdk.skills

**Transport:** Filesystem read/write + CLI for managed skills
**Source of truth:** `~/.openclaw/workspace/skills/` (workspace skills) and the skills platform

#### Methods

```typescript
export class SkillsModule {

    /** Get a skill by ID */
    async get(skillId: string): Promise<Skill>

    /** List all installed skills */
    async list(): Promise<Skill[]>

    /** Install / create a new skill */
    async create(params: CreateSkillParams): Promise<Skill>

    /** Update a skill's content */
    async update(skillId: string, params: UpdateSkillParams): Promise<Skill>

    /** Remove a skill */
    async delete(skillId: string): Promise<void>
}
```

#### Types

```typescript
export interface Skill {
    id: string;
    name: string;
    path: string;               // filesystem path to the skill directory
    type: "bundled" | "managed" | "workspace";
    hasSkillMd: boolean;
    description?: string;
    content?: string;           // the raw SKILL.md content
}

export interface CreateSkillParams {
    id: string;
    name: string;
    content: string;            // SKILL.md content
    files?: Record<string, string>;  // additional files to include
}

export interface UpdateSkillParams {
    name?: string;
    content?: string;
    files?: Record<string, string>;
}
```

#### Implementation Notes
- Skills live at `~/.openclaw/workspace/skills/<skill-id>/SKILL.md`
- `list()` scans the skills directory and reads each `SKILL.md` for metadata
- `create()` creates the directory and writes `SKILL.md` + any additional files
- `delete()` removes the skill directory
- `get()` reads a single skill directory
- Bundled/managed skills may be in different locations — check OpenClaw's skills config

---

## Shared Utilities

### Error Handling

```typescript
export class SDKError extends Error {
    constructor(
        message: string,
        public readonly context?: Record<string, unknown>,
        public readonly cause?: Error,
    ) {
        super(message);
        this.name = "SDKError";
    }
}

export class NotFoundError extends SDKError {
    constructor(resource: string, id: string) {
        super(`${resource} not found: ${id}`, { resource, id });
        this.name = "NotFoundError";
    }
}

export class GatewayError extends SDKError {
    constructor(status: number, message: string) {
        super(`Gateway returned ${status}: ${message}`, { status });
        this.name = "GatewayError";
    }
}
```

### Column Name Conversion

```typescript
/** Convert snake_case DB rows to camelCase for return types */
export function snakeToCamel<T>(obj: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = value;
    }
    return result as T;
}
```

### JSON Column Parser

```typescript
/** Safely parse JSON columns that might be null or malformed */
export function parseJsonColumn<T>(value: string | null): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}
```

### Output Parser

```typescript
/** Parse KEY: value pairs from agent step output */
export function parseStepOutput(output: string | null): Record<string, string> {
    if (!output) return {};
    const result: Record<string, string> = {};
    for (const line of output.split("\n")) {
        const match = line.match(/^([A-Z_]+):\s*(.+)$/);
        if (match) {
            result[match[1].toLowerCase()] = match[2].trim();
        }
    }
    return result;
}
```

---

## Build Configuration

**package.json:**
```json
{
    "name": "openclaw-sdk",
    "version": "0.1.0",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "default": "./dist/index.js"
        }
    },
    "files": ["dist"],
    "scripts": {
        "build": "tsc",
        "dev": "tsc --watch"
    },
    "engines": { "node": ">=22" },
    "devDependencies": {
        "typescript": "^5.x"
    },
    "dependencies": {}
}
```

Zero runtime dependencies. `node:sqlite`, `node:fs`, `node:child_process` are all built-in.

**tsconfig.json:**
```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "Node16",
        "moduleResolution": "Node16",
        "outDir": "dist",
        "rootDir": "src",
        "strict": true,
        "esModuleInterop": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true,
        "skipLibCheck": true
    },
    "include": ["src/**/*"]
}
```

**In your Next.js app's package.json:**
```json
{
    "dependencies": {
        "openclaw-sdk": "file:../openclaw-sdk"
    }
}
```

---

## Implementation Order

1. **types.ts** — all interfaces first, everything else depends on these
2. **transport/cli.ts** + **transport/http.ts** — the two communication channels
3. **client.ts** + **index.ts** — the shell that assembles modules (stub modules)
4. **modules/config.ts** — simplest module, just reads/writes JSON
5. **modules/agents.ts** — you already have this working, migrate it into the new structure
6. **modules/cron.ts** — you already have this working, migrate it
7. **modules/database.ts** — core of the dashboard, build the query layer
8. **modules/activity.ts** — thin layer on top of database
9. **modules/skills.ts** — filesystem operations
10. **modules/usage.ts** — last, because it depends on understanding what data is actually available

---

## Usage in Next.js

```typescript
// lib/sdk.ts (singleton for server-side use)
import { createOpenClawSDK } from "openclaw-sdk";

export const sdk = createOpenClawSDK();

// app/api/runs/route.ts
import { sdk } from "@/lib/sdk";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const runs = await sdk.database.getRuns({
        status: searchParams.get("status") as any,
        limit: Number(searchParams.get("limit") ?? 50),
    });
    return Response.json(runs);
}

// app/api/stats/route.ts
import { sdk } from "@/lib/sdk";

export async function GET() {
    const stats = await sdk.database.getStats();
    return Response.json(stats);
}

// app/dashboard/page.tsx (server component)
import { sdk } from "@/lib/sdk";

export default async function DashboardPage() {
    const stats = await sdk.database.getStats();
    const recentRuns = await sdk.database.getRuns({ limit: 10 });
    const activity = await sdk.activity.list({ limit: 20 });

    return (
        <Dashboard stats={stats} runs={recentRuns.data} activity={activity.data} />
    );
}
```
