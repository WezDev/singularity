import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { WorkflowSpec } from "./types.js";

export function parseWorkflow(yamlPath: string): WorkflowSpec {
    const raw = readFileSync(yamlPath, "utf-8");
    const doc = parseYaml(raw) as WorkflowSpec;

    if (!doc.id) throw new Error(`Workflow missing 'id' field in ${yamlPath}`);
    if (!doc.name) throw new Error(`Workflow missing 'name' field in ${yamlPath}`);
    if (!doc.steps || doc.steps.length === 0) throw new Error(`Workflow missing 'steps' in ${yamlPath}`);
    if (!doc.agents || doc.agents.length === 0) throw new Error(`Workflow missing 'agents' in ${yamlPath}`);

    for (const step of doc.steps) {
        if (!step.id) throw new Error(`Step missing 'id' in ${yamlPath}`);
        if (!step.agent) throw new Error(`Step '${step.id}' missing 'agent' in ${yamlPath}`);
        if (!step.input) throw new Error(`Step '${step.id}' missing 'input' in ${yamlPath}`);

        const agentExists = doc.agents.some(a => a.id === step.agent);
        if (!agentExists) {
            throw new Error(`Step '${step.id}' references unknown agent '${step.agent}' in ${yamlPath}`);
        }
    }

    return doc;
}
