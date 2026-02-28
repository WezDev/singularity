export interface RunRecord {
    id: string;
    jobId: string;
    jobTitle: string;
    agentId: string;
    agentName: string;
    startedAt: string;
    completedAt: string | null;
    durationSeconds: number | null;
    status: 'running' | 'success' | 'failed';
    tokensUsed: number | null;
    costUsd: number | null;
    error: string | null;
}
export interface UsageRecord {
    id: string;
    date: string;
    agentId: string;
    agentName: string;
    model: string;
    tokensInput: number;
    tokensOutput: number;
    tokensTotal: number;
    costUsd: number;
}
export interface ActivityRecord {
    id: string;
    agentId: string;
    agentName: string;
    eventType: string;
    summary: string;
    detail: string;
    timestamp: string;
    tokensUsed: number;
    costUsd: number;
    rawLog: string | null;
}
/**
 * SQLite-backed state store for SDK consumers (e.g., Horizon dashboard).
 *
 * Stores run history, usage records, and activity logs that don't belong
 * in OpenClaw's config. Uses better-sqlite3 for synchronous, fast access.
 */
export declare class StateDatabase {
    private db;
    constructor(dbPath?: string);
    private migrate;
    get runs(): {
        insert(run: RunRecord): void;
        complete(id: string, result: {
            status: "success" | "failed";
            durationSeconds: number;
            tokensUsed?: number;
            costUsd?: number;
            error?: string;
        }): void;
        get(id: string): RunRecord | null;
        listForJob(jobId: string, limit?: number): RunRecord[];
        listRecent(limit?: number): RunRecord[];
        listForAgent(agentId: string, limit?: number): RunRecord[];
    };
    get usage(): {
        upsert(record: UsageRecord): void;
        getByDateRange(from: string, to: string): UsageRecord[];
        getByAgent(agentId: string, from?: string, to?: string): UsageRecord[];
        getTotals(from: string, to: string): {
            tokensTotal: number;
            costUsd: number;
        };
        getPerAgentTotals(from: string, to: string): Array<{
            agentId: string;
            agentName: string;
            model: string;
            tokensTotal: number;
            costUsd: number;
            runCount: number;
        }>;
    };
    get activity(): {
        insert(record: ActivityRecord): void;
        listRecent(limit?: number): ActivityRecord[];
        listForAgent(agentId: string, limit?: number): ActivityRecord[];
        listByType(eventType: string, limit?: number): ActivityRecord[];
        search(query: string, limit?: number): ActivityRecord[];
    };
    /** Close the database connection. */
    close(): void;
}
//# sourceMappingURL=state.d.ts.map