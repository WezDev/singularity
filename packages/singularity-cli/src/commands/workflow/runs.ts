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

    console.log(
        "ID".padEnd(10) +
        "Workflow".padEnd(16) +
        "Task".padEnd(30) +
        "Status".padEnd(10) +
        "Age"
    );

    for (const run of allRuns) {
        const id = run.id.slice(0, 8);
        const task = run.task.length > 27 ? run.task.slice(0, 27) + "..." : run.task;
        console.log(
            id.padEnd(10) +
            run.workflow.padEnd(16) +
            task.padEnd(30) +
            run.status.padEnd(10) +
            timeAgo(run.created_at)
        );
    }
}
