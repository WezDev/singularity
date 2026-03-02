import { randomUUID } from "node:crypto";
import { getDb, initDb, insertEvent, queryOne, queryAll } from "../../db.js";
import { advancePipeline } from "../../pipeline.js";
import type { StepRow } from "../../installer/types.js";

function parseArg(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
}

function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", chunk => { data += chunk; });
        process.stdin.on("end", () => resolve(data.trim()));

        if (process.stdin.isTTY) {
            resolve("");
        }
    });
}

interface StoryInput {
    title: string;
    description?: string;
    acceptance_criteria?: string[];
}

export async function complete(args: string[]): Promise<void> {
    const stepId = parseArg(args, "--step");
    const inputTokens = parseInt(parseArg(args, "--input-tokens") ?? "0", 10) || 0;
    const outputTokens = parseInt(parseArg(args, "--output-tokens") ?? "0", 10) || 0;
    const model = parseArg(args, "--model") ?? null;

    if (!stepId) {
        console.error("Usage: singularity step complete --step <uuid>");
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

    db.prepare(
        "UPDATE steps SET status = 'done', output = ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, model = COALESCE(?, model), completed_at = datetime('now') WHERE id = ?"
    ).run(output || null, inputTokens, outputTokens, model, step.id);

    insertEvent(step.run_id, step.id, "step.completed", {
        output: output?.slice(0, 200),
        inputTokens,
        outputTokens,
        model,
    });

    const storiesMatch = output.match(/STORIES_JSON:\s*(\[[\s\S]*?\])/);
    if (storiesMatch) {
        try {
            const stories = JSON.parse(storiesMatch[1]) as StoryInput[];
            const nextSteps = queryAll<StepRow>(
                "SELECT * FROM steps WHERE run_id = ? AND status = 'pending' ORDER BY created_at ASC",
                step.run_id
            );

            const loopStep = nextSteps[0];
            if (loopStep) {
                for (const story of stories) {
                    const storyId = randomUUID();
                    db.prepare(
                        "INSERT INTO stories (id, step_id, title, description, acceptance_criteria) VALUES (?, ?, ?, ?, ?)"
                    ).run(
                        storyId,
                        loopStep.id,
                        story.title,
                        story.description || null,
                        story.acceptance_criteria ? JSON.stringify(story.acceptance_criteria) : null,
                    );
                }
            }
        } catch {
            // Invalid JSON, skip story creation
        }
    }

    advancePipeline(step.run_id);

    console.log(`Step ${step.id.slice(0, 8)} completed.`);
}
