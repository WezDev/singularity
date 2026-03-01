import { getDb, queryAll, insertEvent } from "./db.js";
import type { StepRow } from "./installer/types.js";

export function advancePipeline(runId: string): void {
    const db = getDb();

    const steps = queryAll<StepRow>(
        "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC", runId
    );

    const allDone = steps.every(s => s.status === "done");
    const anyFailed = steps.some(s => s.status === "failed");
    const nextPending = steps.find(s => s.status === "pending");

    if (allDone) {
        db.prepare(
            "UPDATE runs SET status = 'done', completed_at = datetime('now') WHERE id = ?"
        ).run(runId);
        insertEvent(runId, null, "run.completed");
    } else if (anyFailed && !nextPending) {
        db.prepare(
            "UPDATE runs SET status = 'failed' WHERE id = ?"
        ).run(runId);
        insertEvent(runId, null, "run.failed");
    } else if (nextPending) {
        db.prepare(
            "UPDATE steps SET status = 'ready' WHERE id = ?"
        ).run(nextPending.id);
        insertEvent(runId, nextPending.id, "step.ready");
    }
}
