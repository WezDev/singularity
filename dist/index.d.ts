import { AgentManager } from './agents/manager.js';
import { GatewayClient } from './gateway/client.js';
import { CronManager } from './cron/manager.js';
import { SessionsManager } from './sessions/manager.js';
import { SkillsManager } from './skills/manager.js';
import { StateDatabase } from './database/state.js';
import type { OpenClawConfig, OpenClawSDKOptions, IdentityConfig, ChannelsConfig } from './config/schema.js';
import type { ValidationResult } from './config/validator.js';
export * from './config/schema.js';
export { validateConfig, assertConfigValid, ConfigValidationError, } from './config/validator.js';
export type { ValidationResult, ValidationError } from './config/validator.js';
export { AgentManager, AgentWorkspace } from './agents/manager.js';
export { GatewayClient, GatewayError } from './gateway/client.js';
export type { GatewayHealth } from './gateway/client.js';
export { CronManager } from './cron/manager.js';
export { SessionsManager } from './sessions/manager.js';
export type { Session, SessionListOptions } from './sessions/manager.js';
export { SkillsManager } from './skills/manager.js';
export type { SkillInfo, SkillContent, InstallSkillOptions } from './skills/manager.js';
export { StateDatabase } from './database/state.js';
export type { RunRecord, UsageRecord, ActivityRecord } from './database/state.js';
export { paths, expandTilde, resolvePath } from './filesystem/paths.js';
export { readConfig, readConfigRaw, writeConfig, patchConfig, backupConfig, deepMerge, getConfigValue, setConfigValue, } from './config/reader.js';
/**
 * Unified API for managing an OpenClaw instance.
 *
 * @example
 * ```typescript
 * import { OpenClawSDK } from '@yourorg/openclaw-sdk';
 *
 * const sdk = new OpenClawSDK();
 *
 * // Config
 * const config = await sdk.config.read();
 * await sdk.config.patch({ identity: { name: 'Nova' } });
 *
 * // Agents
 * const agents = await sdk.agents.list();
 * await sdk.agents.create({ id: 'planner', name: 'Planner' });
 *
 * // Gateway
 * const health = await sdk.gateway.health();
 *
 * // Cron
 * const jobs = await sdk.cron.list();
 *
 * // Sessions
 * const sessions = await sdk.sessions.list();
 *
 * // Skills
 * const skills = await sdk.skills.list();
 * const content = await sdk.skills.read('my-skill');
 *
 * // State DB (runs, usage, activity)
 * const recentRuns = sdk.db.runs.listRecent();
 * const todayUsage = sdk.db.usage.getTotals('2026-02-27', '2026-02-27');
 * ```
 */
export declare class OpenClawSDK {
    private configPath;
    private _agents;
    private _gateway;
    private _cron;
    private _sessions;
    private _skills;
    private _db;
    private _dbPath?;
    constructor(options?: OpenClawSDKOptions);
    get config(): {
        /** Read the full OpenClaw config (with $include + env substitution). */
        read: () => Promise<OpenClawConfig>;
        /** Read the raw config (no $include resolution, no env substitution). */
        readRaw: () => Promise<OpenClawConfig>;
        /** Write the full config (atomic write, creates backup first). */
        write: (config: OpenClawConfig) => Promise<void>;
        /** Deep-merge a partial config update (atomic). */
        patch: (patch: Partial<OpenClawConfig>) => Promise<OpenClawConfig>;
        /** Create a timestamped config backup. Returns the backup path. */
        backup: () => Promise<string>;
        /** Get a value by dot-path. e.g. 'agents.defaults.model.primary' */
        get: (path: string) => Promise<unknown>;
        /** Set a value by dot-path (atomic write). */
        set: (path: string, value: unknown) => Promise<void>;
        /** Validate the config. Returns { valid, errors }. */
        validate: () => Promise<ValidationResult>;
    };
    get agents(): AgentManager;
    get gateway(): GatewayClient;
    get cron(): CronManager;
    get sessions(): SessionsManager;
    get skills(): SkillsManager;
    /**
     * Lazily-initialized SQLite database for consumer state
     * (run history, usage records, activity logs).
     */
    get db(): StateDatabase;
    get identity(): {
        get(): Promise<IdentityConfig | undefined>;
        set(identity: IdentityConfig): Promise<void>;
    };
    get channels(): {
        list(): Promise<ChannelsConfig>;
        configure(channel: string, settings: Record<string, unknown>): Promise<void>;
        disable(channel: string): Promise<void>;
    };
    get models(): {
        listProviders(): Promise<Record<string, import("./index.js").ModelProvider>>;
        addProvider(name: string, provider: Record<string, unknown>): Promise<void>;
        removeProvider(name: string): Promise<void>;
        setDefault(modelId: string): Promise<void>;
    };
    /** Close all resources (database connections, etc.). */
    close(): void;
}
//# sourceMappingURL=index.d.ts.map