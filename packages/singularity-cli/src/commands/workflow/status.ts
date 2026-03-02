import { initDb, queryOne, queryAll } from "../../db.js";
import type { RunRow, StepRow, StoryRow } from "../../installer/types.js";

export function status(args: string[]): void {
    const query = args.join(" ");
    if (!query) {
        console.error("Usage: singularity workflow status <query>");
        process.exit(1);
    }

    initDb();

    const run = queryOne<RunRow>(
        "SELECT * FROM runs WHERE task LIKE ? ORDER BY created_at DESC LIMIT 1",
        `%${query}%`
    );

    if (!run) {
        console.error(`No run found matching '${query}'.`);
        process.exit(1);
    }

    const steps = queryAll<StepRow>(
        "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC", run.id
    );

    console.log(`Run: ${run.id.slice(0, 8)}`);
    console.log(`Workflow: ${run.workflow}`);
    if (run.run_spec) {
        console.log(`Run template: ${run.run_spec}`);
    }
    console.log(`Task: ${run.task}`);
    if (run.scheduled_at) {
        console.log(`Scheduled: ${run.scheduled_at}`);
    }
    console.log(`Status: ${run.status}`);
    console.log();
    console.log("Steps:");

    let runInputTokens = 0;
    let runOutputTokens = 0;

    for (const step of steps) {
        const statusStr = step.status.padEnd(7);
        let line = `  [${statusStr}] ${step.step_name} (${step.agent_id.split("_").pop()})`;

        if (step.status === "running" || step.status === "done") {
            const stories = queryAll<StoryRow>(
                "SELECT * FROM stories WHERE step_id = ?", step.id
            );

            if (stories.length > 0) {
                const done = stories.filter(s => s.status === "done").length;
                line += `  Stories: ${done}/${stories.length} done`;
            }
        }

        const totalTokens = (step.input_tokens ?? 0) + (step.output_tokens ?? 0);
        if (totalTokens > 0) {
            line += `  Tokens: ${totalTokens.toLocaleString()}`;
            if (step.model) line += ` (${step.model})`;
        }

        runInputTokens += step.input_tokens ?? 0;
        runOutputTokens += step.output_tokens ?? 0;

        console.log(line);
    }

    if (runInputTokens + runOutputTokens > 0) {
        console.log();
        console.log(`Total tokens: ${(runInputTokens + runOutputTokens).toLocaleString()} (in: ${runInputTokens.toLocaleString()}, out: ${runOutputTokens.toLocaleString()})`);
    }
}
