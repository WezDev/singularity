import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { SDKConfig, ResolvedSDKConfig } from "./types.js";
import { HttpTransport } from "./transport/http.js";
import { CliTransport } from "./transport/cli.js";
import { AgentsModule } from "./modules/agents.js";
import { CronModule } from "./modules/cron.js";
import { UsageModule } from "./modules/usage.js";
import { DatabaseModule } from "./modules/database.js";
import { ActivityModule } from "./modules/activity.js";
import { ConfigModule } from "./modules/config.js";
import { SkillsModule } from "./modules/skills.js";

interface DiscoveredDefaults {
    gatewayUrl?: string;
    authToken?: string;
    workspace?: string;
}

function discoverFromOpenClaw(): DiscoveredDefaults {
    try {
        const configPath = resolve(homedir(), ".openclaw/openclaw.json");
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        const defaults: DiscoveredDefaults = {};

        if (raw?.gateway?.port) {
            const bind = raw.gateway.bind === "loopback" ? "127.0.0.1" : "0.0.0.0";
            defaults.gatewayUrl = `http://${bind}:${raw.gateway.port}`;
        }

        if (raw?.gateway?.auth?.mode === "token" && raw.gateway.auth.token) {
            defaults.authToken = raw.gateway.auth.token;
        }

        const workspace = raw?.agents?.defaults?.workspace;
        if (typeof workspace === "string") {
            defaults.workspace = workspace.replace(/^~/, homedir());
        }

        return defaults;
    } catch {
        // Config file not found or unparseable
        return {};
    }
}

export function resolveConfig(config?: SDKConfig): ResolvedSDKConfig {
    const home = homedir();
    const discovered = discoverFromOpenClaw();
    const openclawDir = resolve(home, ".openclaw");
    const singularityDir = resolve(openclawDir, "singularity");
    const workspace = discovered.workspace ?? resolve(openclawDir, "workspace");

    return {
        gatewayUrl: config?.gatewayUrl ?? discovered.gatewayUrl ?? "http://127.0.0.1:18789",
        authToken: config?.authToken ?? discovered.authToken,
        cliBinary: config?.cliBinary ?? "openclaw",
        dbPath: config?.dbPath ?? resolve(singularityDir, "state.db"),
        configPath: config?.configPath ?? resolve(openclawDir, "openclaw.json"),
        cronStorePath: config?.cronStorePath ?? resolve(singularityDir, "cron/jobs.json"),
        skillsDir: config?.skillsDir ?? resolve(workspace, "skills"),
        agentsBaseDir: config?.agentsBaseDir ?? resolve(openclawDir, "agents"),
    };
}

export class SingularitySDK {
    public readonly agents: AgentsModule;
    public readonly cron: CronModule;
    public readonly usage: UsageModule;
    public readonly database: DatabaseModule;
    public readonly activity: ActivityModule;
    public readonly config: ConfigModule;
    public readonly skills: SkillsModule;

    constructor(sdkConfig?: SDKConfig) {
        const resolved = resolveConfig(sdkConfig);
        const http = new HttpTransport(resolved.gatewayUrl, resolved.authToken);
        const cli = new CliTransport(resolved.cliBinary);

        this.agents = new AgentsModule(http, cli, resolved);
        this.cron = new CronModule(http, cli, resolved);
        this.usage = new UsageModule(resolved);
        this.database = new DatabaseModule(resolved);
        this.activity = new ActivityModule(resolved);
        this.config = new ConfigModule(resolved);
        this.skills = new SkillsModule(resolved);
    }
}
