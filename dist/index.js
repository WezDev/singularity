import { AgentManager } from './agents/manager.js';
import { readConfig, readConfigRaw, writeConfig, patchConfig, backupConfig, getConfigValue, setConfigValue, } from './config/reader.js';
import { validateConfig } from './config/validator.js';
import { GatewayClient } from './gateway/client.js';
import { CronManager } from './cron/manager.js';
import { SessionsManager } from './sessions/manager.js';
import { SkillsManager } from './skills/manager.js';
import { StateDatabase } from './database/state.js';
import { paths } from './filesystem/paths.js';
// ─── Re-exports ───────────────────────────────────────────────────────────────
export * from './config/schema.js';
export { validateConfig, assertConfigValid, ConfigValidationError, } from './config/validator.js';
export { AgentManager, AgentWorkspace } from './agents/manager.js';
export { GatewayClient, GatewayError } from './gateway/client.js';
export { CronManager } from './cron/manager.js';
export { SessionsManager } from './sessions/manager.js';
export { SkillsManager } from './skills/manager.js';
export { StateDatabase } from './database/state.js';
export { paths, expandTilde, resolvePath } from './filesystem/paths.js';
export { readConfig, readConfigRaw, writeConfig, patchConfig, backupConfig, deepMerge, getConfigValue, setConfigValue, } from './config/reader.js';
// ─── Main SDK Class ───────────────────────────────────────────────────────────
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
export class OpenClawSDK {
    configPath;
    _agents;
    _gateway;
    _cron;
    _sessions;
    _skills;
    _db = null;
    _dbPath;
    constructor(options = {}) {
        this.configPath = options.configPath || paths.config;
        this._gateway = new GatewayClient(options.gatewayUrl, options.gatewayToken);
        this._agents = new AgentManager(this.configPath);
        this._cron = new CronManager(this._gateway);
        this._sessions = new SessionsManager(this._gateway);
        this._skills = new SkillsManager();
        this._dbPath = options.dbPath;
    }
    // ── Config ────────────────────────────────────────────────────────────────
    get config() {
        const configPath = this.configPath;
        return {
            /** Read the full OpenClaw config (with $include + env substitution). */
            read: () => readConfig(configPath),
            /** Read the raw config (no $include resolution, no env substitution). */
            readRaw: () => readConfigRaw(configPath),
            /** Write the full config (atomic write, creates backup first). */
            write: (config) => writeConfig(config, configPath),
            /** Deep-merge a partial config update (atomic). */
            patch: (patch) => patchConfig(patch, configPath),
            /** Create a timestamped config backup. Returns the backup path. */
            backup: () => backupConfig(configPath),
            /** Get a value by dot-path. e.g. 'agents.defaults.model.primary' */
            get: async (path) => {
                const config = await readConfig(configPath);
                return getConfigValue(config, path);
            },
            /** Set a value by dot-path (atomic write). */
            set: async (path, value) => {
                const config = await readConfigRaw(configPath);
                const updated = setConfigValue(config, path, value);
                await writeConfig(updated, configPath);
            },
            /** Validate the config. Returns { valid, errors }. */
            validate: async () => {
                try {
                    const config = await readConfig(configPath);
                    return validateConfig(config);
                }
                catch (err) {
                    return {
                        valid: false,
                        errors: [{ path: '(root)', message: `Parse error: ${err.message}` }],
                    };
                }
            },
        };
    }
    // ── Agents ────────────────────────────────────────────────────────────────
    get agents() {
        return this._agents;
    }
    // ── Gateway ───────────────────────────────────────────────────────────────
    get gateway() {
        return this._gateway;
    }
    // ── Cron ──────────────────────────────────────────────────────────────────
    get cron() {
        return this._cron;
    }
    // ── Sessions ──────────────────────────────────────────────────────────────
    get sessions() {
        return this._sessions;
    }
    // ── Skills ────────────────────────────────────────────────────────────────
    get skills() {
        return this._skills;
    }
    // ── State Database ────────────────────────────────────────────────────────
    /**
     * Lazily-initialized SQLite database for consumer state
     * (run history, usage records, activity logs).
     */
    get db() {
        if (!this._db) {
            this._db = new StateDatabase(this._dbPath);
        }
        return this._db;
    }
    // ── Identity (convenience) ────────────────────────────────────────────────
    get identity() {
        const sdk = this;
        return {
            async get() {
                const config = await sdk.config.read();
                return config.identity;
            },
            async set(identity) {
                await sdk.config.patch({ identity });
            },
        };
    }
    // ── Channels (convenience) ────────────────────────────────────────────────
    get channels() {
        const sdk = this;
        return {
            async list() {
                const config = await sdk.config.read();
                return config.channels || {};
            },
            async configure(channel, settings) {
                await sdk.config.patch({
                    channels: { [channel]: settings },
                });
            },
            async disable(channel) {
                await sdk.config.patch({
                    channels: { [channel]: { enabled: false } },
                });
            },
        };
    }
    // ── Models (convenience) ──────────────────────────────────────────────────
    get models() {
        const sdk = this;
        return {
            async listProviders() {
                const config = await sdk.config.read();
                return config.models?.providers || {};
            },
            async addProvider(name, provider) {
                const config = await sdk.config.readRaw();
                config.models = config.models || {};
                config.models.providers = config.models.providers || {};
                config.models.providers[name] = provider;
                await sdk.config.write(config);
            },
            async removeProvider(name) {
                const config = await sdk.config.readRaw();
                if (config.models?.providers?.[name]) {
                    delete config.models.providers[name];
                    await sdk.config.write(config);
                }
            },
            async setDefault(modelId) {
                await sdk.config.patch({
                    agents: { defaults: { model: { primary: modelId } } },
                });
            },
        };
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /** Close all resources (database connections, etc.). */
    close() {
        this._db?.close();
        this._db = null;
    }
}
//# sourceMappingURL=index.js.map