import type { SQLInputValue } from "node:sqlite";
import type { ResolvedSDKConfig, Event, ActivityEvent, ActivityQuery, PaginatedResult } from "../types.js";
import { DatabaseModule } from "./database.js";

export class ActivityModule {
    private db: DatabaseModule;

    constructor(config: ResolvedSDKConfig) {
        this.db = new DatabaseModule(config);
    }

    async get(eventId: number): Promise<Event | null> {
        return this.db.queryOne<Event>(
            "SELECT * FROM events WHERE id = ?",
            [eventId]
        );
    }

    async list(params: ActivityQuery = {}): Promise<PaginatedResult<ActivityEvent>> {
        const { runId, stepId, eventType, limit = 50, offset = 0 } = params;
        const conditions: string[] = [];
        const values: SQLInputValue[] = [];

        if (runId) { conditions.push("e.run_id = ?"); values.push(runId); }
        if (stepId) { conditions.push("e.step_id = ?"); values.push(stepId); }
        if (eventType) { conditions.push("e.event_type = ?"); values.push(eventType); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const total = this.db.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM events e ${where}`, values
        )!.count;

        const data = this.db.query<ActivityEvent>(`
            SELECT e.*, r.task as run_task, s.step_name, s.agent_id
            FROM events e
            LEFT JOIN runs r ON e.run_id = r.id
            LEFT JOIN steps s ON e.step_id = s.id
            ${where}
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `, [...values, limit, offset]);

        console.log(data)

        return { data, total, limit, offset };
    }
}
