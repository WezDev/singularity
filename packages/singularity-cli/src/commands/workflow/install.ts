import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { initDb, insertEvent } from "../../db.js";
import { parseWorkflow } from "../../installer/workflow-spec.js";
import { createAgent, createCronJob } from "../../installer/gateway-api.js";
import { buildPollingPrompt, staggerSchedule } from "../../installer/agent-cron.js";
import { getWorkflowsDir } from "../../paths.js";
import type { WorkflowSpec } from "../../installer/types.js";

function copyAuthFromMainAgent(agentId: string): void {
    const home = homedir();
    const mainAuthPath = resolve(home, ".openclaw/agents/main/agent/auth-profiles.json");
    if (!existsSync(mainAuthPath)) return;

    const agentAuthDir = resolve(home, `.openclaw/agents/${agentId}/agent`);
    const agentAuthPath = join(agentAuthDir, "auth-profiles.json");
    if (existsSync(agentAuthPath)) return;

    mkdirSync(agentAuthDir, { recursive: true });
    copyFileSync(mainAuthPath, agentAuthPath);
}

export async function installWorkflow(spec: WorkflowSpec, workflowsDir: string): Promise<number> {
    const baseWorkspace = resolve(homedir(), ".openclaw/workspace/workflows", spec.id);
    let agentCount = 0;

    for (let i = 0; i < spec.agents.length; i++) {
        const agent = spec.agents[i];
        const agentId = `${spec.id}_${agent.id}`;
        const workspacePath = resolve(baseWorkspace, agent.id);

        mkdirSync(workspacePath, { recursive: true });

        // Copy agent files into workspace
        for (const [destName, srcRelative] of Object.entries(agent.workspace.files)) {
            const srcPath = resolve(dirname(workflowsDir), srcRelative);
            if (existsSync(srcPath)) {
                const content = readFileSync(srcPath, "utf-8");
                writeFileSync(join(workspacePath, destName), content);
            }
        }

        // Register agent in config.json (with model if specified)
        await createAgent(agentId, workspacePath, agent.role, agent.description, agent.model);

        // Copy auth from main agent if not already configured
        copyAuthFromMainAgent(agentId);

        // Create cron job (pollingModel overrides agent model for polling sessions)
        const schedule = staggerSchedule(i, spec.agents.length);
        const prompt = buildPollingPrompt(spec.id, agentId);
        const cronName = `${agentId}_poll`;
        const cronModel = agent.pollingModel ?? spec.polling?.model;
        await createCronJob(cronName, schedule, agentId, prompt, cronModel);

        agentCount++;
    }

    return agentCount;
}

export async function install(args: string[]): Promise<void> {
    const workflowId = args[0];

    if (!workflowId) {
        console.error("Usage: singularity workflow install <workflow-id>");
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
    const agentCount = await installWorkflow(spec, dir);
    insertEvent(null, null, "workflow.installed", { workflow: spec.id, agents: agentCount });

    console.log(`Installed workflow: ${spec.id} (${agentCount} agents)`);
}
