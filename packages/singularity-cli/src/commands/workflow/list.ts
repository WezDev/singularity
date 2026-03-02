import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { getWorkflowsDir } from "../../paths.js";

export function list(_args: string[]): void {
    const dir = getWorkflowsDir();
    let files: string[];
    try {
        files = readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
        console.error("No workflows directory found.");
        process.exit(1);
    }

    if (files.length === 0) {
        console.log("No workflows found.");
        return;
    }

    console.log("Available workflows:");
    for (const file of files) {
        const spec = parseWorkflow(join(dir, file));
        const name = spec.name.padEnd(25);
        console.log(`  ${spec.id.padEnd(16)}${name}${spec.agents.length} agents, ${spec.runs.length} runs`);
    }
}
