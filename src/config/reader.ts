import { readFile, writeFile, copyFile, access, rename } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { randomBytes } from 'crypto';
import JSON5 from 'json5';
import { paths, expandTilde } from '../filesystem/paths.js';
import type { OpenClawConfig } from './schema.js';

// ─── $include Resolution ──────────────────────────────────────────────────────

/**
 * Resolve `$include` directives in a parsed config object.
 *
 * OpenClaw supports:
 *   { agents: { $include: "./agents.json5" } }
 *   { broadcast: { $include: ["./clients/a.json5", "./clients/b.json5"] } }
 *
 * Each included file is parsed as JSON5 and merged into the parent object.
 */
async function resolveIncludes(
  obj: Record<string, unknown>,
  baseDir: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      key === '$include' &&
      (typeof value === 'string' || Array.isArray(value))
    ) {
      // This object IS an include directive — resolve and merge
      const includePaths = Array.isArray(value) ? value : [value];
      for (const relPath of includePaths) {
        const absPath = resolve(baseDir, relPath as string);
        const raw = await readFile(absPath, 'utf-8');
        const parsed = JSON5.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const resolved = await resolveIncludes(parsed, dirname(absPath));
          Object.assign(result, resolved);
        } else {
          // Included file is a non-object (e.g., an array) — return it directly
          return parsed;
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = value as Record<string, unknown>;
      if ('$include' in child) {
        result[key] = await resolveIncludes(child, baseDir);
      } else {
        result[key] = await resolveIncludes(child, baseDir);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ─── ${VAR} Environment Substitution ──────────────────────────────────────────

/**
 * Recursively substitute `${VAR_NAME}` patterns in string values.
 *
 * OpenClaw supports env var substitution in any string config value.
 * `$${VAR}` (double dollar) is escaped and produces a literal `${VAR}`.
 */
function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj
      .replace(/\$\$\{(\w+)\}/g, '___ESCAPED_ENV_$1___')
      .replace(/\$\{(\w+)\}/g, (_match, varName) => {
        return process.env[varName] ?? '';
      })
      .replace(/___ESCAPED_ENV_(\w+)___/g, '${$1}');
  }

  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }

  return obj;
}

// ─── Read Config ──────────────────────────────────────────────────────────────

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
export async function readConfig(
  configPath?: string,
  options: ReadConfigOptions = {},
): Promise<OpenClawConfig> {
  const { resolveIncludes: doIncludes = true, substituteEnv = true } = options;

  const filepath = expandTilde(configPath || paths.config);
  const raw = await readFile(filepath, 'utf-8');
  let parsed = JSON5.parse(raw) as Record<string, unknown>;

  if (doIncludes) {
    parsed = await resolveIncludes(parsed, dirname(filepath));
  }

  if (substituteEnv) {
    parsed = substituteEnvVars(parsed) as Record<string, unknown>;
  }

  return parsed as OpenClawConfig;
}

/**
 * Read the raw config without $include resolution or env substitution.
 * Useful for config editing where you want to preserve the original structure.
 */
export async function readConfigRaw(configPath?: string): Promise<OpenClawConfig> {
  return readConfig(configPath, { resolveIncludes: false, substituteEnv: false });
}

// ─── Write Config (Atomic) ────────────────────────────────────────────────────

/**
 * Write the OpenClaw config file atomically.
 *
 * 1. Creates a timestamped backup of the existing file
 * 2. Writes to a temporary file in the same directory
 * 3. Renames the temp file over the original (atomic on same filesystem)
 *
 * This prevents the Gateway from seeing a half-written config.
 */
export async function writeConfig(
  config: OpenClawConfig,
  configPath?: string,
): Promise<void> {
  const filepath = expandTilde(configPath || paths.config);

  // Backup before writing
  await backupConfig(filepath);

  // Write to temp file in the same directory (atomic rename requires same FS)
  const dir = dirname(filepath);
  const tempFile = join(dir, `.openclaw-config-${randomBytes(6).toString('hex')}.tmp`);

  try {
    const output = JSON.stringify(config, null, 2);
    await writeFile(tempFile, output, 'utf-8');

    // Atomic rename
    await rename(tempFile, filepath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempFile);
    } catch { /* ignore */ }
    throw err;
  }
}

// ─── Backup ───────────────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of the config file.
 * Returns the backup path, or empty string if source doesn't exist.
 */
export async function backupConfig(configPath?: string): Promise<string> {
  const filepath = expandTilde(configPath || paths.config);

  try {
    await access(filepath);
  } catch {
    return '';
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filepath}.backup.${timestamp}`;
  await copyFile(filepath, backupPath);
  return backupPath;
}

// ─── Deep Merge ───────────────────────────────────────────────────────────────

/**
 * Deep merge a partial config into an existing config.
 * Objects are recursively merged. Arrays are replaced entirely.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

// ─── Patch Config ─────────────────────────────────────────────────────────────

/**
 * Read → deep merge → atomic write. Returns the merged config.
 */
export async function patchConfig(
  patch: Partial<OpenClawConfig>,
  configPath?: string,
): Promise<OpenClawConfig> {
  // Read raw to preserve $include refs when writing back
  const current = await readConfigRaw(configPath);
  const merged = deepMerge(
    current as Record<string, unknown>,
    patch as Record<string, unknown>,
  ) as OpenClawConfig;
  await writeConfig(merged, configPath);
  return merged;
}

// ─── Dot-path Accessors ───────────────────────────────────────────────────────

/**
 * Get a deeply nested config value by dot-path.
 * e.g., getConfigValue(config, 'agents.defaults.model.primary')
 */
export function getConfigValue(config: OpenClawConfig, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a deeply nested config value by dot-path. Returns a new config object.
 */
export function setConfigValue(
  config: OpenClawConfig,
  path: string,
  value: unknown,
): OpenClawConfig {
  const parts = path.split('.');
  const result = structuredClone(config);
  let current: Record<string, unknown> = result as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}
