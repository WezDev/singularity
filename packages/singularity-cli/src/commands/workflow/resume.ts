import { getDb, initDb, insertEvent, queryOne } from "../../db.js";
import type { RunRow, StepRow } from "../../installer/types.js";

export function resume(args: string[]): void {
    const runId = args[0];

    if (!runId) {
        console.error("Usage: singularity workflow resume <run-id>");
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

    if (run.status !== "failed") {
        console.error(`Run ${run.id.slice(0, 8)} is '${run.status}', not 'failed'. Cannot resume.`);
        process.exit(1);
    }

    const failedStep = queryOne<StepRow>(
        "SELECT * FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY created_at ASC LIMIT 1",
        run.id
    );

    if (!failedStep) {
        console.error("No failed step found to resume.");
        process.exit(1);
    }

    db.prepare("UPDATE steps SET status = 'ready', retry_count = 0 WHERE id = ?").run(failedStep.id);
    db.prepare("UPDATE runs SET status = 'running' WHERE id = ?").run(run.id);

    insertEvent(run.id, failedStep.id, "run.resumed");

    console.log(`Resumed run ${run.id.slice(0, 8)} from step '${failedStep.step_name}'.`);
}
