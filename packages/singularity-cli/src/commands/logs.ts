import { initDb, queryAll } from "../db.js";
import type { EventRow } from "../installer/types.js";

export function logs(args: string[]): void {
    const limit = parseInt(args[0] || "50", 10);

    initDb();

    const events = queryAll<EventRow>(
        "SELECT * FROM events ORDER BY created_at DESC LIMIT ?", limit
    );

    if (events.length === 0) {
        console.log("No events found.");
        return;
    }

    for (const event of events) {
        const time = event.created_at;
        const runId = event.run_id ? event.run_id.slice(0, 8) : "--------";
        const stepId = event.step_id ? event.step_id.slice(0, 8) : "";
        const details = event.details ? ` ${event.details}` : "";
        console.log(`${time}  ${event.event_type.padEnd(20)}  run:${runId}  ${stepId ? `step:${stepId}` : ""}${details}`);
    }
}
