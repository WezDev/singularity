import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedSDKConfig, Agent, CreateAgentParams, UpdateAgentParams, SingularityConfig, AgentConfigEntry } from "../types.js";
import { NotFoundError } from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { CliTransport } from "../transport/cli.js";

export class AgentsModule {
    constructor(
        private http: HttpTransport,
        private cli: CliTransport,
        private config: ResolvedSDKConfig,
    ) {}

    async list(): Promise<Agent[]> {
        const config = this.readConfig();
        const agents = this.extractAgentsList(config);
        return agents.map(toAgent);
    }

    async get(agentId: string): Promise<Agent> {
        const agents = await this.list();
        const agent = agents.find(a => a.id === agentId);
        if (!agent) throw new NotFoundError("Agent", agentId);
        return agent;
    }

    async create(params: CreateAgentParams): Promise<Agent> {
        const config = this.readConfig();
        const agents = this.ensureAgentsList(config);

        const existing = agents.find(a => a.id === params.id);
        if (existing) {
            // Update in place instead of duplicating
            if (params.name) existing.name = params.name;
            if (params.model) existing.model = params.model;
            if (params.workspace) existing.workspace = params.workspace;
        } else {
            // Only write fields that OpenClaw recognizes on agent entries.
            // role/description are singularity-specific and stored elsewhere.
            const entry: AgentConfigEntry = {
                id: params.id,
                ...(params.name && { name: params.name }),
                ...(params.model && { model: params.model }),
                ...(params.workspace && { workspace: params.workspace }),
            };
            agents.push(entry);
        }

        if (params.workspace) {
            mkdirSync(params.workspace, { recursive: true });
        }

        this.writeConfig(config);
        const saved = agents.find(a => a.id === params.id)!;
        return toAgent({ ...saved, role: params.role, description: params.description });
    }

    async delete(agentId: string): Promise<void> {
        const config = this.readConfig();
        const agents = this.extractAgentsList(config);

        const idx = agents.findIndex(a => a.id === agentId);
        if (idx === -1) throw new NotFoundError("Agent", agentId);

        const agent = agents[idx];
        agents.splice(idx, 1);
        this.writeConfig(config);

        if (agent.workspace) {
            try {
                rmSync(agent.workspace, { recursive: true, force: true });
            } catch {
                // workspace may already be gone
            }
        }
    }

    async update(agentId: string, params: UpdateAgentParams): Promise<Agent> {
        const config = this.readConfig();
        const agents = this.extractAgentsList(config);

        const agent = agents.find(a => a.id === agentId);
        if (!agent) throw new NotFoundError("Agent", agentId);

        if (params.name !== undefined) agent.name = params.name;
        if (params.model !== undefined) agent.model = params.model;
        if (params.workspace !== undefined) agent.workspace = params.workspace;
        if (params.role !== undefined) agent.role = params.role;
        if (params.description !== undefined) agent.description = params.description;

        this.writeConfig(config);
        return toAgent(agent);
    }

    private extractAgentsList(config: SingularityConfig): AgentConfigEntry[] {
        // Support both flat array (config.agents = [...]) and
        // nested openclaw format (config.agents = { list: [...] })
        if (Array.isArray(config.agents)) {
            return config.agents;
        }
        const nested = config.agents as unknown as { list?: AgentConfigEntry[] } | undefined;
        return nested?.list ?? [];
    }

    private ensureAgentsList(config: SingularityConfig): AgentConfigEntry[] {
        if (Array.isArray(config.agents)) {
            return config.agents;
        }
        const nested = config.agents as unknown as { list?: AgentConfigEntry[] } | undefined;
        if (nested) {
            if (!nested.list) nested.list = [];
            return nested.list;
        }
        config.agents = [];
        return config.agents;
    }

    private readConfig(): SingularityConfig {
        try {
            return JSON.parse(readFileSync(this.config.configPath, "utf-8")) as SingularityConfig;
        } catch {
            return {};
        }
    }

    private writeConfig(config: SingularityConfig): void {
        mkdirSync(dirname(this.config.configPath), { recursive: true });
        writeFileSync(this.config.configPath, JSON.stringify(config, null, 2));
    }
}

function toAgent(entry: AgentConfigEntry): Agent {
    return {
        id: entry.id,
        name: entry.name as string | undefined,
        model: entry.model,
        workspace: entry.workspace,
        role: entry.role,
        description: entry.description as string | undefined,
        isDefault: entry.isDefault as boolean | undefined,
    };
}
