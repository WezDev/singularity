import type { OpenClawConfig } from './schema.js';
export interface ReadConfigOptions {
    /** Resolve $include directives. Default: true */
    resolveIncludes?: boolean;
    /** Substitute ${VAR} env variables. Default: true */
    substituteEnv?: boolean;
}
/**
 * Read and parse the OpenClaw config file (JSON5 format).
 *
 * By default, resolves `$include` directives and substitutes `${VAR}` env vars.
 */
export declare function readConfig(configPath?: string, options?: ReadConfigOptions): Promise<OpenClawConfig>;
/**
 * Read the raw config without $include resolution or env substitution.
 * Useful for config editing where you want to preserve the original structure.
 */
export declare function readConfigRaw(configPath?: string): Promise<OpenClawConfig>;
/**
 * Write the OpenClaw config file atomically.
 *
 * 1. Creates a timestamped backup of the existing file
 * 2. Writes to a temporary file in the same directory
 * 3. Renames the temp file over the original (atomic on same filesystem)
 *
 * This prevents the Gateway from seeing a half-written config.
 */
export declare function writeConfig(config: OpenClawConfig, configPath?: string): Promise<void>;
/**
 * Create a timestamped backup of the config file.
 * Returns the backup path, or empty string if source doesn't exist.
 */
export declare function backupConfig(configPath?: string): Promise<string>;
/**
 * Deep merge a partial config into an existing config.
 * Objects are recursively merged. Arrays are replaced entirely.
 */
export declare function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown>;
/**
 * Read → deep merge → atomic write. Returns the merged config.
 */
export declare function patchConfig(patch: Partial<OpenClawConfig>, configPath?: string): Promise<OpenClawConfig>;
/**
 * Get a deeply nested config value by dot-path.
 * e.g., getConfigValue(config, 'agents.defaults.model.primary')
 */
export declare function getConfigValue(config: OpenClawConfig, path: string): unknown;
/**
 * Set a deeply nested config value by dot-path. Returns a new config object.
 */
export declare function setConfigValue(config: OpenClawConfig, path: string, value: unknown): OpenClawConfig;
//# sourceMappingURL=reader.d.ts.map