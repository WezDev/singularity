import { z } from 'zod';
import type { OpenClawConfig } from './schema.js';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
// These mirror the validation rules from OpenClaw's zod-schema.ts.
// We intentionally don't use .strict() here — the SDK validates structure
// but allows unknown keys so it doesn't break on newer OpenClaw versions.

const modelSelectionSchema = z.object({
  primary: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
}).optional();

const agentToolsPolicySchema = z.object({
  deny: z.array(z.string()).optional(),
  allow: z.array(z.string()).optional(),
}).optional();

const agentEntrySchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Agent ID must contain only letters, numbers, hyphens, and underscores'),
  name: z.string().optional(),
  default: z.boolean().optional(),
  workspace: z.string().optional(),
  model: modelSelectionSchema,
  tools: z.object({ policy: agentToolsPolicySchema }).optional(),
  description: z.string().optional(),
  role: z.string().optional(),
}).passthrough();

const agentBindingSchema = z.object({
  agentId: z.string().min(1),
  match: z.object({
    channel: z.string().optional(),
    peer: z.object({
      kind: z.enum(['group', 'dm']).optional(),
      id: z.string().optional(),
    }).optional(),
  }),
});

const gatewaySchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
  mode: z.enum(['local', 'hybrid', 'remote']).optional(),
  bind: z.enum(['loopback', 'all']).optional(),
  auth: z.object({
    mode: z.enum(['token', 'password', 'none']).optional(),
    token: z.string().optional(),
    password: z.string().optional(),
    allowTailscale: z.boolean().optional(),
  }).optional(),
  reload: z.boolean().optional(),
  remote: z.string().url().optional(),
}).optional();

const identitySchema = z.object({
  name: z.string().optional(),
  emoji: z.string().optional(),
  theme: z.string().optional(),
  avatar: z.string().optional(),
}).optional();

const cronJobSchema = z.object({
  name: z.string().min(1, 'Cron job name cannot be empty'),
  schedule: z.object({
    kind: z.literal('cron'),
    expr: z.string().min(1, 'Cron expression cannot be empty'),
  }),
  sessionTarget: z.enum(['isolated', 'last']).optional(),
  agentId: z.string().optional(),
  payload: z.object({
    kind: z.literal('agentTurn'),
    message: z.string().min(1),
    model: z.string().optional(),
    timeoutSeconds: z.number().int().positive().optional(),
  }).optional(),
});

const configSchema = z.object({
  meta: z.object({
    lastTouchedVersion: z.string().optional(),
    lastTouchedAt: z.string().optional(),
  }).optional(),
  gateway: gatewaySchema,
  identity: identitySchema,
  agents: z.object({
    defaults: z.object({
      workspace: z.string().optional(),
      model: modelSelectionSchema,
    }).passthrough().optional(),
    list: z.array(agentEntrySchema).optional(),
    bindings: z.array(agentBindingSchema).optional(),
  }).optional(),
  channels: z.record(z.unknown()).optional(),
  models: z.object({
    mode: z.enum(['merge', 'replace']).optional(),
    providers: z.record(z.unknown()).optional(),
  }).optional(),
  auth: z.object({
    profiles: z.record(z.unknown()).optional(),
    order: z.record(z.array(z.string())).optional(),
  }).optional(),
  tools: z.record(z.unknown()).optional(),
  memory: z.object({
    flush: z.object({
      softThresholdTokens: z.number().int().positive().optional(),
      prompt: z.string().optional(),
    }).optional(),
  }).optional(),
  session: z.record(z.unknown()).optional(),
  wizard: z.record(z.unknown()).optional(),
  cron: z.array(cronJobSchema).optional(),
  $schema: z.string().optional(),
}).passthrough();

// ─── Validation Result ────────────────────────────────────────────────────────

export interface ValidationError {
  /** Dot-path to the invalid field, e.g. "agents.list.0.id" */
  path: string;
  /** Human-readable error message */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Validate ─────────────────────────────────────────────────────────────────

/**
 * Validate an OpenClaw config against the schema.
 *
 * Returns structured errors with dot-paths. Does NOT throw.
 */
export function validateConfig(config: OpenClawConfig): ValidationResult {
  const result = configSchema.safeParse(config);

  if (result.success) {
    // Run additional semantic checks that Zod can't express
    const semanticErrors = checkSemantics(config);
    return {
      valid: semanticErrors.length === 0,
      errors: semanticErrors,
    };
  }

  const errors: ValidationError[] = result.error.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  return { valid: false, errors };
}

/**
 * Validate and throw on first error. Useful for write guards.
 */
export function assertConfigValid(config: OpenClawConfig): void {
  const result = validateConfig(config);
  if (!result.valid) {
    const first = result.errors[0];
    throw new ConfigValidationError(
      `Invalid config at "${first.path}": ${first.message}`,
      result.errors,
    );
  }
}

// ─── Validate a single cron job definition ────────────────────────────────────

export function validateCronJob(job: unknown): ValidationResult {
  const result = cronJobSchema.safeParse(job);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}

// ─── Semantic Checks ──────────────────────────────────────────────────────────

function checkSemantics(config: OpenClawConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for duplicate agent IDs
  if (config.agents?.list) {
    const seen = new Set<string>();
    config.agents.list.forEach((agent, i) => {
      if (seen.has(agent.id)) {
        errors.push({
          path: `agents.list.${i}.id`,
          message: `Duplicate agent ID: "${agent.id}"`,
        });
      }
      seen.add(agent.id);
    });

    // Check that at most one agent is marked default
    const defaults = config.agents.list.filter(a => a.default);
    if (defaults.length > 1) {
      errors.push({
        path: 'agents.list',
        message: `Multiple agents marked as default: ${defaults.map(a => a.id).join(', ')}`,
      });
    }
  }

  // Check bindings reference existing agents
  if (config.agents?.bindings && config.agents?.list) {
    const agentIds = new Set(config.agents.list.map(a => a.id));
    config.agents.bindings.forEach((binding, i) => {
      if (!agentIds.has(binding.agentId)) {
        errors.push({
          path: `agents.bindings.${i}.agentId`,
          message: `Binding references non-existent agent: "${binding.agentId}"`,
        });
      }
    });
  }

  return errors;
}

// ─── Error Class ──────────────────────────────────────────────────────────────

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[],
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}
