import { homedir } from 'os';
import { join } from 'path';

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw');

/**
 * Canonical OpenClaw filesystem paths.
 * All paths resolve relative to ~/.openclaw/ unless OPENCLAW_HOME is set.
 */
export const paths = {
  /** Root OpenClaw directory */
  home: OPENCLAW_HOME,

  /** Main config file (JSON5) */
  config: join(OPENCLAW_HOME, 'openclaw.json'),

  /** Agent workspace directory */
  agent: (id: string) => join(OPENCLAW_HOME, 'agents', id),

  /** Agent workspace file */
  agentFile: (id: string, filename: string) => join(OPENCLAW_HOME, 'agents', id, filename),

  /** Agent memory directory */
  agentMemory: (id: string) => join(OPENCLAW_HOME, 'agents', id, 'memory'),

  /** Agent sessions directory */
  agentSessions: (id: string) => join(OPENCLAW_HOME, 'agents', id, 'sessions'),

  /** Workflow workspaces root */
  workspaces: join(OPENCLAW_HOME, 'workspaces'),

  /** Specific workflow workspace */
  workflowWorkspace: (id: string) => join(OPENCLAW_HOME, 'workspaces', 'workflows', id),

  /** Skills directory */
  skills: join(OPENCLAW_HOME, 'skills'),

  /** Specific skill directory */
  skill: (id: string) => join(OPENCLAW_HOME, 'skills', id),

  /** Cron directory */
  cron: join(OPENCLAW_HOME, 'cron'),

  /** Cron jobs file */
  cronJobs: join(OPENCLAW_HOME, 'cron', 'jobs.json'),

  /** Credentials directory */
  credentials: join(OPENCLAW_HOME, 'credentials'),

  /** Default main workspace */
  workspace: join(OPENCLAW_HOME, 'workspace'),
} as const;

/**
 * Expand ~ to home directory in a path string.
 */
export function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Resolve an OpenClaw path, expanding ~ and env vars.
 */
export function resolvePath(filepath: string): string {
  let resolved = filepath;

  // Expand $HOME, ${HOME}, etc.
  resolved = resolved.replace(/\$\{?HOME\}?/g, homedir());
  resolved = resolved.replace(/\$\{?OPENCLAW_HOME\}?/g, OPENCLAW_HOME);

  // Expand tilde
  resolved = expandTilde(resolved);

  return resolved;
}
