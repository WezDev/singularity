import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ResolvedSDKConfig, SingularityConfig } from "../types.js";

export class ConfigModule {
    constructor(private config: ResolvedSDKConfig) {}

    async get(): Promise<SingularityConfig> {
        try {
            const raw = readFileSync(this.config.configPath, "utf-8");
            return JSON.parse(raw) as SingularityConfig;
        } catch {
            return {};
        }
    }

    async getKey<K extends keyof SingularityConfig>(key: K): Promise<SingularityConfig[K]> {
        const config = await this.get();
        return config[key];
    }

    async update(patch: Partial<SingularityConfig>): Promise<SingularityConfig> {
        const current = await this.get();
        const merged = deepMerge(current, patch);
        mkdirSync(dirname(this.config.configPath), { recursive: true });
        writeFileSync(this.config.configPath, JSON.stringify(merged, null, 2));
        return merged;
    }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): SingularityConfig {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === "object" && !Array.isArray(value) && typeof result[key] === "object" && result[key] && !Array.isArray(result[key])) {
            result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result as SingularityConfig;
}
