import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
    ResolvedSDKConfig, Workflow, WorkflowStepDef, WorkflowRunDef,
    CreateWorkflowParams, UpdateWorkflowParams, AgentConfigEntry,
} from "../types.js";
import { NotFoundError } from "../errors.js";

interface YamlStep {
    id: string;
    agent: string;
    input: string;
    expects: string;
    type?: string;
    loop?: { over: string; completion: string };
    max_retries?: number;
    on_fail?: { retry_step?: string; max_retries?: number; on_exhausted?: { escalate_to: string } };
}

interface YamlRunTemplate {
    id: string;
    name: string;
    description: string;
    steps: YamlStep[];
}

interface YamlWorkflow {
    id: string;
    name: string;
    version: number;
    description: string;
    agents: Workflow["agents"];
    runs: YamlRunTemplate[];
}

function yamlStepToSdk(s: YamlStep): WorkflowStepDef {
    return {
        id: s.id,
        agent: s.agent,
        input: s.input,
        expects: s.expects,
        type: s.type,
        loop: s.loop,
        maxRetries: s.max_retries,
        onFail: s.on_fail ? {
            retryStep: s.on_fail.retry_step,
            maxRetries: s.on_fail.max_retries,
            onExhausted: s.on_fail.on_exhausted
                ? { escalateTo: s.on_fail.on_exhausted.escalate_to }
                : undefined,
        } : undefined,
    };
}

function sdkStepToYaml(s: WorkflowStepDef): YamlStep {
    const step: YamlStep = { id: s.id, agent: s.agent, input: s.input, expects: s.expects };
    if (s.type) step.type = s.type;
    if (s.loop) step.loop = s.loop;
    if (s.maxRetries !== undefined) step.max_retries = s.maxRetries;
    if (s.onFail) {
        step.on_fail = {};
        if (s.onFail.retryStep) step.on_fail.retry_step = s.onFail.retryStep;
        if (s.onFail.maxRetries !== undefined) step.on_fail.max_retries = s.onFail.maxRetries;
        if (s.onFail.onExhausted) step.on_fail.on_exhausted = { escalate_to: s.onFail.onExhausted.escalateTo };
    }
    return step;
}

function yamlRunToSdk(r: YamlRunTemplate): WorkflowRunDef {
    return {
        id: r.id,
        name: r.name,
        description: r.description,
        steps: r.steps.map(yamlStepToSdk),
    };
}

function sdkRunToYaml(r: WorkflowRunDef): YamlRunTemplate {
    return {
        id: r.id,
        name: r.name,
        description: r.description,
        steps: r.steps.map(sdkStepToYaml),
    };
}

function parseYamlWorkflow(filePath: string): Workflow {
    const raw = readFileSync(filePath, "utf-8");
    const doc = parseYaml(raw) as YamlWorkflow;
    return {
        id: doc.id,
        name: doc.name,
        version: doc.version,
        description: doc.description,
        status: "not_installed",
        agents: doc.agents.map(a => ({ id: a.id, name: a.name, role: a.role, description: a.description, ...(a.model && { model: a.model }) })),
        runs: doc.runs.map(yamlRunToSdk),
    };
}

function workflowToYaml(workflow: { id: string; name: string; version?: number; description: string; agents: Workflow["agents"]; runs: WorkflowRunDef[] }): string {
    const doc: YamlWorkflow = {
        id: workflow.id,
        name: workflow.name,
        version: workflow.version ?? 1,
        description: workflow.description,
        agents: workflow.agents,
        runs: workflow.runs.map(sdkRunToYaml),
    };
    return stringifyYaml(doc);
}

export class WorkflowsModule {
    constructor(private config: ResolvedSDKConfig) {}

    private get dir(): string {
        return this.config.workflowsDir;
    }

    private findFile(id: string): string | null {
        if (!existsSync(this.dir)) return null;
        const files = readdirSync(this.dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
        const match = files.find(f => basename(f).replace(/\.ya?ml$/, "") === id);
        return match ? resolve(this.dir, match) : null;
    }

    private getInstalledAgentIds(): Set<string> {
        try {
            const raw = JSON.parse(readFileSync(this.config.configPath, "utf-8"));
            const agents: AgentConfigEntry[] = Array.isArray(raw?.agents)
                ? raw.agents
                : (raw?.agents as { list?: AgentConfigEntry[] })?.list ?? [];
            return new Set(agents.map(a => a.id));
        } catch {
            return new Set();
        }
    }

    private resolveStatus(workflow: Workflow): Workflow {
        const installedIds = this.getInstalledAgentIds();
        const allInstalled = workflow.agents.length > 0
            && workflow.agents.every(a => installedIds.has(`${workflow.id}_${a.id}`));
        return { ...workflow, status: allInstalled ? "installed" : "not_installed" };
    }

    async list(): Promise<Workflow[]> {
        if (!existsSync(this.dir)) return [];
        const files = readdirSync(this.dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
        const installedIds = this.getInstalledAgentIds();
        return files.map(f => {
            const wf = parseYamlWorkflow(resolve(this.dir, f));
            const allInstalled = wf.agents.length > 0
                && wf.agents.every(a => installedIds.has(`${wf.id}_${a.id}`));
            return { ...wf, status: allInstalled ? "installed" as const : "not_installed" as const };
        });
    }

    async get(id: string): Promise<Workflow> {
        const filePath = this.findFile(id);
        if (!filePath) throw new NotFoundError("Workflow", id);
        return this.resolveStatus(parseYamlWorkflow(filePath));
    }

    async create(params: CreateWorkflowParams): Promise<Workflow> {
        mkdirSync(this.dir, { recursive: true });
        const filePath = resolve(this.dir, `${params.id}.yaml`);
        const yaml = workflowToYaml(params);
        writeFileSync(filePath, yaml);
        return this.get(params.id);
    }

    async update(id: string, params: UpdateWorkflowParams): Promise<Workflow> {
        const existing = await this.get(id);
        const merged = {
            id: existing.id,
            name: params.name ?? existing.name,
            version: existing.version,
            description: params.description ?? existing.description,
            agents: params.agents ?? existing.agents,
            runs: params.runs ?? existing.runs,
        };
        const filePath = this.findFile(id)!;
        writeFileSync(filePath, workflowToYaml(merged));
        return this.get(id);
    }

    async delete(id: string): Promise<void> {
        const filePath = this.findFile(id);
        if (!filePath) throw new NotFoundError("Workflow", id);
        rmSync(filePath);
    }
}
