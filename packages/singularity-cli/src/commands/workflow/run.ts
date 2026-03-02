import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, initDb, insertEvent } from "../../db.js";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { getWorkflowsDir } from "../../paths.js";

function parseFlag(args: string[], flag: string): { value: string | undefined; remaining: string[] } {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return { value: undefined, remaining: args };
    const value = args[idx + 1];
    const remaining = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { value, remaining };
}

export function run(args: string[]): void {
    let remaining = args;
    const scheduledResult = parseFlag(remaining, "--at");
    const scheduledAt = scheduledResult.value;
    remaining = scheduledResult.remaining;

    const runFlagResult = parseFlag(remaining, "--run");
    const runTemplateId = runFlagResult.value;
    remaining = runFlagResult.remaining;

    const workflowId = remaining[0];
    const task = remaining.slice(1).join(" ");

    if (!workflowId || !task) {
        console.error("Usage: singularity workflow run <workflow-id> [--run <run-id>] [--at <ISO8601>] <task>");
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

    // Resolve the run template
    let runTemplate;
    if (runTemplateId) {
        runTemplate = spec.runs.find(r => r.id === runTemplateId);
        if (!runTemplate) {
            console.error(`Run template '${runTemplateId}' not found. Available: ${spec.runs.map(r => r.id).join(", ")}`);
            process.exit(1);
        }
    } else if (spec.runs.length === 1) {
        runTemplate = spec.runs[0];
    } else {
        console.error(`Workflow '${workflowId}' has multiple run templates. Use --run <id> to specify one.`);
        console.error(`Available: ${spec.runs.map(r => `${r.id} (${r.name})`).join(", ")}`);
        process.exit(1);
    }

    initDb();
    const db = getDb();
    const runId = randomUUID();

    db.prepare(
        "INSERT INTO runs (id, workflow, task, status, run_spec, scheduled_at) VALUES (?, ?, ?, 'running', ?, ?)"
    ).run(runId, spec.id, task, runTemplate.id, scheduledAt ?? null);

    for (let i = 0; i < runTemplate.steps.length; i++) {
        const step = runTemplate.steps[i];
        const stepId = randomUUID();
        const status = i === 0 ? "ready" : "pending";
        const agentId = `${spec.id}_${step.agent}`;
        const maxRetries = step.on_fail?.max_retries ?? step.max_retries ?? 2;

        db.prepare(
            "INSERT INTO steps (id, run_id, step_name, agent_id, status, input, max_retries) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(stepId, runId, step.id, agentId, status, step.input, maxRetries);
    }

    insertEvent(runId, null, "run.created", { workflow: spec.id, runSpec: runTemplate.id, task, scheduledAt: scheduledAt ?? null });

    const shortId = runId.slice(0, 8);
    console.log(`Run: ${shortId}`);
    console.log(`Workflow: ${spec.id}`);
    console.log(`Run template: ${runTemplate.id} (${runTemplate.name})`);
    console.log(`Task: ${task}`);
    if (scheduledAt) {
        console.log(`Scheduled: ${scheduledAt}`);
    }
    console.log(`Status: running`);
    console.log(`Steps: ${runTemplate.steps.length} (first step ready for pickup)`);
}
