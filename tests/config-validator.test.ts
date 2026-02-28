import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  assertConfigValid,
  ConfigValidationError,
  validateCronJob,
} from '../src/config/validator.js';
import type { OpenClawConfig } from '../src/config/schema.js';

describe('validateConfig', () => {
  it('accepts a valid minimal config', () => {
    const result = validateConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a full valid config', () => {
    const config: OpenClawConfig = {
      meta: { lastTouchedVersion: '1.0.0' },
      gateway: { port: 18789, mode: 'local', bind: 'loopback' },
      identity: { name: 'Bot', emoji: '🤖' },
      agents: {
        defaults: { model: { primary: 'anthropic/claude-sonnet-4-5' } },
        list: [
          { id: 'agent-1', name: 'Agent One' },
          { id: 'agent-2', name: 'Agent Two' },
        ],
        bindings: [
          { agentId: 'agent-1', match: { channel: 'telegram' } },
        ],
      },
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid gateway port', () => {
    const result = validateConfig({
      gateway: { port: 99999 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toContain('gateway');
  });

  it('rejects invalid gateway mode', () => {
    const result = validateConfig({
      gateway: { mode: 'invalid' as any },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty agent ID', () => {
    const result = validateConfig({
      agents: { list: [{ id: '' }] },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects agent ID with invalid characters', () => {
    const result = validateConfig({
      agents: { list: [{ id: 'has spaces' }] },
    });
    expect(result.valid).toBe(false);
  });

  it('detects duplicate agent IDs', () => {
    const result = validateConfig({
      agents: {
        list: [
          { id: 'agent-1', name: 'One' },
          { id: 'agent-1', name: 'Duplicate' },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('detects multiple default agents', () => {
    const result = validateConfig({
      agents: {
        list: [
          { id: 'a1', default: true },
          { id: 'a2', default: true },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Multiple agents marked as default'))).toBe(true);
  });

  it('detects dangling binding references', () => {
    const result = validateConfig({
      agents: {
        list: [{ id: 'agent-1' }],
        bindings: [
          { agentId: 'nonexistent', match: { channel: 'telegram' } },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('non-existent agent'))).toBe(true);
  });

  it('allows unknown keys (passthrough)', () => {
    const config = {
      identity: { name: 'Test' },
      futureFeature: { enabled: true },
    } as OpenClawConfig;
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });
});

describe('assertConfigValid', () => {
  it('does not throw for valid config', () => {
    expect(() => assertConfigValid({})).not.toThrow();
  });

  it('throws ConfigValidationError for invalid config', () => {
    expect(() =>
      assertConfigValid({ gateway: { port: -1 } }),
    ).toThrow(ConfigValidationError);
  });
});

describe('validateCronJob', () => {
  it('accepts a valid cron job', () => {
    const result = validateCronJob({
      name: 'daily-digest',
      schedule: { kind: 'cron', expr: '0 8 * * 1-5' },
      sessionTarget: 'isolated',
      agentId: 'researcher',
      payload: {
        kind: 'agentTurn',
        message: 'Run the digest',
        timeoutSeconds: 300,
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects cron job with empty name', () => {
    const result = validateCronJob({
      name: '',
      schedule: { kind: 'cron', expr: '* * * * *' },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects cron job with missing schedule', () => {
    const result = validateCronJob({ name: 'test' });
    expect(result.valid).toBe(false);
  });
});
