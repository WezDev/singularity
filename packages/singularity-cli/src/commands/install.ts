import { readdirSync } from "node:fs";
import { join } from "node:path";
import { initDb } from "../db.js";
import { parseWorkflow } from "../installer/workflow-spec.js";
import { installWorkflow } from "./workflow/install.js";
import { getWorkflowsDir } from "../paths.js";

export async function install(args: string[]): Promise<void> {
    const workflowId = args[0];

    // If a specific workflow ID was given, delegate to the single-workflow installer
    if (workflowId) {
        const { install: installSingle } = await import("./workflow/install.js");
        return installSingle(args);
    }

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

    initDb();
    console.log("Initialized database");

    let totalCronJobs = 0;

    for (const file of files) {
        const spec = parseWorkflow(join(dir, file));
        const agentCount = await installWorkflow(spec, dir);
        totalCronJobs += agentCount;
        console.log(`Installed workflow: ${spec.id} (${agentCount} agents)`);
    }

    console.log(`Created ${totalCronJobs} cron jobs`);
}
