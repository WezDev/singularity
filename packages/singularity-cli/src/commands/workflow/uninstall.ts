import { readdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { getDb, initDb, insertEvent, queryAll } from "../../db.js";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { removeAgent, removeCronJob } from "../../installer/gateway-api.js";
import { getWorkflowsDir } from "../../paths.js";

export async function uninstall(args: string[]): Promise<void> {
    const workflowId = args[0];

    if (!workflowId) {
        console.error("Usage: singularity workflow uninstall <workflow-id>");
        process.exit(1);
    }

    const dir = getWorkflowsDir();
    let files: string[];
    try {
        files = readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
        console.error("No workflows directory found.");
        process.exit(1);
    }

    const yamlFile = files.find(f => f.replace(/\.ya?ml$/, "") === workflowId);
    if (!yamlFile) {
        console.error(`Workflow '${workflowId}' not found.`);
        process.exit(1);
    }

    const spec = parseWorkflow(join(dir, yamlFile));

    initDb();

    for (const agent of spec.agents) {
        const agentId = `${spec.id}_${agent.id}`;
        await removeCronJob(`${agentId}_poll`);
        await removeAgent(agentId);
    }

    const baseWorkspace = resolve(homedir(), ".openclaw/workspace/workflows", spec.id);
    try {
        rmSync(baseWorkspace, { recursive: true, force: true });
    } catch {
        // May not exist
    }

    const db = getDb();
    const allRuns = queryAll<{ id: string }>("SELECT id FROM runs WHERE workflow = ?", spec.id);
    for (const r of allRuns) {
        db.prepare("DELETE FROM stories WHERE step_id IN (SELECT id FROM steps WHERE run_id = ?)").run(r.id);
        db.prepare("DELETE FROM steps WHERE run_id = ?").run(r.id);
        db.prepare("DELETE FROM events WHERE run_id = ?").run(r.id);
    }
    db.prepare("DELETE FROM runs WHERE workflow = ?").run(spec.id);

    insertEvent(null, null, "workflow.uninstalled", { workflow: spec.id });
    console.log(`Uninstalled workflow: ${spec.id}`);
}
