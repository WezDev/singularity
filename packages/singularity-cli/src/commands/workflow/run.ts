import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, initDb, insertEvent } from "../../db.js";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { getWorkflowsDir } from "../../paths.js";

export function run(args: string[]): void {
    const workflowId = args[0];
    const task = args.slice(1).join(" ");

    if (!workflowId || !task) {
        console.error("Usage: singularity workflow run <workflow-id> <task>");
        process.exit(1);
    }

    const dir = getWorkflowsDir();
    let files: string[];
    try {
        files = readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
        console.error("No workflows directory found. Run 'singularity install' first.");
        process.exit(1);
    }

    const yamlFile = files.find(f => f.replace(/\.ya?ml$/, "") === workflowId);
    if (!yamlFile) {
        console.error(`Workflow '${workflowId}' not found.`);
        process.exit(1);
    }

    const spec = parseWorkflow(join(dir, yamlFile));

    initDb();
    const db = getDb();
    const runId = randomUUID();

    db.prepare(
        "INSERT INTO runs (id, workflow, task, status) VALUES (?, ?, ?, 'running')"
    ).run(runId, spec.id, task);

    for (let i = 0; i < spec.steps.length; i++) {
        const step = spec.steps[i];
        const stepId = randomUUID();
        const status = i === 0 ? "ready" : "pending";
        const agentId = `${spec.id}_${step.agent}`;
        const maxRetries = step.on_fail?.max_retries ?? step.max_retries ?? 2;

        db.prepare(
            "INSERT INTO steps (id, run_id, step_name, agent_id, status, input, max_retries) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(stepId, runId, step.id, agentId, status, step.input, maxRetries);
    }

    insertEvent(runId, null, "run.created", { workflow: spec.id, task });

    const shortId = runId.slice(0, 8);
    console.log(`Run: ${shortId}`);
    console.log(`Workflow: ${spec.id}`);
    console.log(`Task: ${task}`);
    console.log(`Status: running`);
    console.log(`Steps: ${spec.steps.length} (first step ready for pickup)`);
}
