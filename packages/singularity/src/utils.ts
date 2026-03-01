import { resolve } from "node:path";
import { homedir } from "node:os";

export function snakeToCamel<T>(obj: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        result[camelKey] = value;
    }
    return result as T;
}

export function parseJsonColumn<T>(value: string | null): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export function parseStepOutput(output: string | null): Record<string, string> {
    if (!output) return {};
    const result: Record<string, string> = {};
    for (const line of output.split("\n")) {
        const match = line.match(/^([A-Z_]+):\s*(.+)$/);
        if (match) {
            result[match[1].toLowerCase()] = match[2].trim();
        }
    }
    return result;
}

export function resolvePath(path: string): string {
    if (path.startsWith("~")) {
        return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
}
