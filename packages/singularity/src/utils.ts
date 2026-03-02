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
    const lines = output.split("\n");
    let currentKey: string | null = null;
    let currentLines: string[] = [];

    for (const line of lines) {
        const match = line.match(/^([A-Z_]+):\s*(.*)$/);
        if (match) {
            if (currentKey) {
                result[currentKey] = currentLines.join("\n").trim();
            }
            currentKey = match[1].toLowerCase();
            currentLines = match[2].trim() ? [match[2].trim()] : [];
        } else if (currentKey) {
            currentLines.push(line);
        }
    }
    if (currentKey) {
        result[currentKey] = currentLines.join("\n").trim();
    }

    return result;
}

export function resolvePath(path: string): string {
    if (path.startsWith("~")) {
        return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
}
