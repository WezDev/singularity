import { resolve } from "node:path";

// Package root is always 1 level up from dist/ (where compiled JS lives)
const PKG_ROOT = resolve(__dirname, "..");

export function getWorkflowsDir(): string {
    return resolve(PKG_ROOT, "workflows");
}

export function getAgentsDir(): string {
    return resolve(PKG_ROOT, "agents");
}
