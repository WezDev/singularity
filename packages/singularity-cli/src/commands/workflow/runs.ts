import { initDb, queryAll } from "../../db.js";
import type { RunRow } from "../../installer/types.js";

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr + "Z").getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function runs(_args: string[]): void {
    initDb();

    const allRuns = queryAll<RunRow>("SELECT * FROM runs ORDER BY created_at DESC");

    if (allRuns.length === 0) {
        console.log("No runs found.");
        return;
    }

    // Pre-fetch token totals per run
    const tokensByRun = new Map<string, number>();
    const tokenRows = queryAll<{ run_id: string; total: number }>(
        "SELECT run_id, COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) as total FROM steps GROUP BY run_id"
    );
    for (const row of tokenRows) {
        tokensByRun.set(row.run_id, row.total);
    }

    console.log(
        "ID".padEnd(10) +
        "Workflow".padEnd(16) +
        "Run".padEnd(14) +
        "Task".padEnd(26) +
        "Status".padEnd(10) +
        "Tokens".padEnd(12) +
        "Age"
    );

    for (const run of allRuns) {
        const id = run.id.slice(0, 8);
        const runSpec = (run.run_spec ?? "-").padEnd(14);
        const task = run.task.length > 23 ? run.task.slice(0, 23) + "..." : run.task;
        const tokens = tokensByRun.get(run.id) ?? 0;
        const tokensStr = tokens > 0 ? tokens.toLocaleString() : "-";
        console.log(
            id.padEnd(10) +
            run.workflow.padEnd(16) +
            runSpec +
            task.padEnd(26) +
            run.status.padEnd(10) +
            tokensStr.padEnd(12) +
            timeAgo(run.created_at)
        );
    }
}
