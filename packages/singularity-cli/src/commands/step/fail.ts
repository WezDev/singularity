import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, initDb, insertEvent, queryOne } from "../../db.js";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { getWorkflowsDir } from "../../paths.js";
import type { StepRow, RunRow } from "../../installer/types.js";

function parseArg(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
}

function readStdin(): Promise<string> {
    return new Promise((res) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", chunk => { data += chunk; });
        process.stdin.on("end", () => res(data.trim()));

        if (process.stdin.isTTY) {
            res("");
        }
    });
}

export async function fail(args: string[]): Promise<void> {
    const stepId = parseArg(args, "--step");
    const inputTokens = parseInt(parseArg(args, "--input-tokens") ?? "0", 10) || 0;
    const outputTokens = parseInt(parseArg(args, "--output-tokens") ?? "0", 10) || 0;
    const model = parseArg(args, "--model") ?? null;

    if (!stepId) {
        console.error("Usage: singularity step fail --step <uuid>");
        process.exit(1);
    }

    const output = await readStdin();

    initDb();
    const db = getDb();

    const step = queryOne<StepRow>(
        "SELECT * FROM steps WHERE id = ? OR id LIKE ?", stepId, `${stepId}%`
    );

    if (!step) {
        console.error(`Step '${stepId}' not found.`);
        process.exit(1);
    }

    const run = queryOne<RunRow>("SELECT * FROM runs WHERE id = ?", step.run_id)!;

    const newRetryCount = step.retry_count + 1;
    db.prepare(
        "UPDATE steps SET retry_count = ?, output = ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, model = COALESCE(?, model) WHERE id = ?"
    ).run(newRetryCount, output || null, inputTokens, outputTokens, model, step.id);

    let retryStep: string | undefined;
    let maxRetries = step.max_retries;
    let escalate = false;

    try {
        const dir = getWorkflowsDir();
        const files = readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
        const yamlFile = files.find(f => f.replace(/\.ya?ml$/, "") === run.workflow);
        if (yamlFile) {
            const spec = parseWorkflow(join(dir, yamlFile));
            // Find the step in the correct run template
            const runSpecId = run.run_spec;
            const runTemplate = runSpecId
                ? spec.runs.find(r => r.id === runSpecId)
                : spec.runs[0];
            const stepSpec = runTemplate?.steps.find(s => s.id === step.step_name);
            if (stepSpec?.on_fail) {
                retryStep = stepSpec.on_fail.retry_step;
                if (stepSpec.on_fail.max_retries !== undefined) {
                    maxRetries = stepSpec.on_fail.max_retries;
                }
                if (stepSpec.on_fail.on_exhausted?.escalate_to === "human") {
                    escalate = true;
                }
            }
        }
    } catch {
        // Can't load spec, use defaults
    }

    if (newRetryCount < maxRetries) {
        if (retryStep) {
            const targetStep = queryOne<StepRow>(
                "SELECT * FROM steps WHERE run_id = ? AND step_name = ?",
                step.run_id, retryStep
            );

            if (targetStep) {
                db.prepare(
                    "UPDATE steps SET status = 'ready', retry_count = retry_count + 1 WHERE id = ?"
                ).run(targetStep.id);
                const issues = output.match(/ISSUES:\s*([\s\S]*)/)?.[1]?.trim() || output;
                db.prepare("UPDATE steps SET output = ? WHERE id = ?").run(
                    `VERIFY_FEEDBACK: ${issues}`, targetStep.id,
                );
                insertEvent(step.run_id, targetStep.id, "step.retrying", { feedback: issues.slice(0, 200) });
            }
        } else {
            db.prepare("UPDATE steps SET status = 'ready' WHERE id = ?").run(step.id);
            insertEvent(step.run_id, step.id, "step.retrying");
        }

        if (retryStep) {
            db.prepare("UPDATE steps SET status = 'pending' WHERE id = ?").run(step.id);
        }

        console.log(`Step ${step.id.slice(0, 8)} failed (retry ${newRetryCount}/${maxRetries}).`);
    } else {
        db.prepare(
            "UPDATE steps SET status = 'failed', completed_at = datetime('now') WHERE id = ?"
        ).run(step.id);

        insertEvent(step.run_id, step.id, "step.failed");

        if (escalate) {
            db.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(step.run_id);
            insertEvent(step.run_id, step.id, "step.escalated", { escalate_to: "human" });
            console.log(`Step ${step.id.slice(0, 8)} exhausted retries. Escalated to human.`);
        } else {
            db.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(step.run_id);
            insertEvent(step.run_id, null, "run.failed");
            console.log(`Step ${step.id.slice(0, 8)} failed permanently.`);
        }
    }
}
