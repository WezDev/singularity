import { getDb, initDb, insertEvent, queryOne } from "../../db.js";
import type { RunRow } from "../../installer/types.js";

export function stop(args: string[]): void {
    const runId = args[0];

    if (!runId) {
        console.error("Usage: singularity workflow stop <run-id>");
        process.exit(1);
    }

    initDb();
    const db = getDb();

    const run = queryOne<RunRow>(
        "SELECT * FROM runs WHERE id = ? OR id LIKE ?", runId, `${runId}%`
    );

    if (!run) {
        console.error(`Run '${runId}' not found.`);
        process.exit(1);
    }

    db.prepare("UPDATE runs SET status = 'stopped', completed_at = datetime('now') WHERE id = ?").run(run.id);
    db.prepare("UPDATE steps SET status = 'stopped' WHERE run_id = ? AND status IN ('running', 'ready')").run(run.id);

    insertEvent(run.id, null, "run.stopped");

    console.log(`Stopped run ${run.id.slice(0, 8)}.`);
}
