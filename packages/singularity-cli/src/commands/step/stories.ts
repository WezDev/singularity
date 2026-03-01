import { initDb, queryOne, queryAll } from "../../db.js";
import type { StepRow, StoryRow } from "../../installer/types.js";

function parseArg(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
}

export function stories(args: string[]): void {
    const stepId = parseArg(args, "--step");

    if (!stepId) {
        console.error("Usage: singularity step stories --step <uuid>");
        process.exit(1);
    }

    initDb();

    const step = queryOne<StepRow>(
        "SELECT * FROM steps WHERE id = ? OR id LIKE ?", stepId, `${stepId}%`
    );

    if (!step) {
        console.error(`Step '${stepId}' not found.`);
        process.exit(1);
    }

    const allStories = queryAll<StoryRow>(
        "SELECT * FROM stories WHERE step_id = ? ORDER BY created_at ASC", step.id
    );

    if (allStories.length === 0) {
        console.log("No stories found for this step.");
        return;
    }

    console.log(`Stories for step ${step.step_name} (run ${step.run_id.slice(0, 8)}):`);

    for (let i = 0; i < allStories.length; i++) {
        const story = allStories[i];
        const statusStr = story.status.padEnd(7);
        console.log(`  [${statusStr}] S-${i + 1}: ${story.title}`);
    }
}
