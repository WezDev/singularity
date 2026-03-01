import { getDb, initDb, insertEvent, queryOne, queryAll } from "../../db.js";
import type { StepRow, RunRow } from "../../installer/types.js";

function parseArg(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
}

function resolveTemplateVariables(
    input: string,
    run: RunRow,
    previousSteps: StepRow[],
): string {
    let resolved = input;

    resolved = resolved.replace(/\{\{task\}\}/g, run.task);

    for (const step of previousSteps) {
        if (step.output) {
            for (const line of step.output.split("\n")) {
                const match = line.match(/^([A-Z_]+):\s*(.+)$/);
                if (match) {
                    const key = match[1].toLowerCase();
                    const value = match[2].trim();
                    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
                }
            }
        }
    }

    return resolved;
}

export function claim(args: string[]): void {
    const workflowId = parseArg(args, "--workflow");
    const agentId = parseArg(args, "--agent");

    if (!workflowId || !agentId) {
        console.error("Usage: singularity step claim --workflow <id> --agent <id>");
        process.exit(1);
    }

    initDb();
    const db = getDb();

    const step = queryOne<StepRow>(`
        SELECT s.* FROM steps s
        JOIN runs r ON s.run_id = r.id
        WHERE s.agent_id = ?
        AND s.status = 'ready'
        AND r.workflow = ?
        AND r.status = 'running'
        AND (r.scheduled_at IS NULL OR r.scheduled_at <= datetime('now'))
        ORDER BY s.created_at ASC
        LIMIT 1
    `, agentId, workflowId);

    if (!step) {
        console.log("NO_WORK");
        return;
    }

    db.prepare(
        "UPDATE steps SET status = 'running', claimed_at = datetime('now') WHERE id = ?"
    ).run(step.id);

    insertEvent(step.run_id, step.id, "step.claimed", { agent: agentId });

    const run = queryOne<RunRow>("SELECT * FROM runs WHERE id = ?", step.run_id)!;

    const previousSteps = queryAll<StepRow>(
        "SELECT * FROM steps WHERE run_id = ? AND status = 'done' ORDER BY created_at ASC",
        step.run_id
    );

    const resolvedInput = resolveTemplateVariables(step.input || "", run, previousSteps);

    console.log(`STEP_ID: ${step.id}`);
    console.log(`WORKFLOW: ${workflowId}`);
    console.log(`STEP: ${step.step_name}`);
    console.log("---");
    console.log(resolvedInput);
}
