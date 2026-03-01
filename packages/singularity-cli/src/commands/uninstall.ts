import { readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { dbExists } from "../db.js";
import { parseWorkflow } from "../installer/workflow-spec.js";
import { removeAgent, removeCronJob } from "../installer/gateway-api.js";
import { getWorkflowsDir } from "../paths.js";

export async function uninstall(args: string[]): Promise<void> {
    const force = args.includes("--force");
    const home = homedir();

    const dir = getWorkflowsDir();
    let cronCount = 0;
    let agentCount = 0;

    try {
        const files = readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
        for (const file of files) {
            try {
                const spec = parseWorkflow(join(dir, file));
                for (const agent of spec.agents) {
                    const agentId = `${spec.id}_${agent.id}`;
                    try {
                        await removeCronJob(`${agentId}_poll`);
                        cronCount++;
                    } catch (err) {
                        if (!force) throw err;
                    }
                    try {
                        await removeAgent(agentId);
                        agentCount++;
                    } catch (err) {
                        if (!force) throw err;
                    }
                }
            } catch (err) {
                if (!force) throw err;
            }
        }
    } catch (err) {
        if (!force) {
            console.error("Failed to clean up cron/agents:", err);
            process.exit(1);
        }
    }

    if (cronCount > 0) console.log(`Removed ${cronCount} cron jobs`);
    if (agentCount > 0) console.log(`Removed ${agentCount} agents from config.json`);

    const workspacesDir = resolve(home, ".openclaw/workspace/workflows");
    if (existsSync(workspacesDir)) {
        try {
            rmSync(workspacesDir, { recursive: true, force: true });
            console.log("Deleted workflow workspaces");
        } catch (err) {
            if (!force) throw err;
        }
    }

    if (dbExists()) {
        const dbDir = resolve(home, ".openclaw/singularity");
        try {
            rmSync(dbDir, { recursive: true, force: true });
            console.log("Deleted database");
        } catch (err) {
            if (!force) throw err;
        }
    }

    console.log("Cleanup complete");
}
