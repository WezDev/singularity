import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readConfig,
  readConfigRaw,
  writeConfig,
  patchConfig,
  backupConfig,
  deepMerge,
  getConfigValue,
  setConfigValue,
} from '../src/config/reader.js';
import type { OpenClawConfig } from '../src/config/schema.js';

let tempDir: string;
let configPath: string;

const sampleConfig: OpenClawConfig = {
  meta: { lastTouchedVersion: '1.0.0' },
  gateway: { port: 18789, mode: 'local' },
  identity: { name: 'TestBot', emoji: '🤖' },
  agents: {
    defaults: { model: { primary: 'anthropic/claude-sonnet-4-5' } },
    list: [
      { id: 'agent-1', name: 'Agent One' },
      { id: 'agent-2', name: 'Agent Two' },
    ],
    bindings: [
      { agentId: 'agent-1', match: { channel: 'telegram', peer: { kind: 'dm' } } },
    ],
  },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'openclaw-test-'));
  configPath = join(tempDir, 'openclaw.json');
  await writeFile(configPath, JSON.stringify(sampleConfig, null, 2), 'utf-8');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('reads and parses a config file', async () => {
    const config = await readConfig(configPath);
    expect(config.identity?.name).toBe('TestBot');
    expect(config.gateway?.port).toBe(18789);
    expect(config.agents?.list).toHaveLength(2);
  });

  it('reads JSON5 format (comments, trailing commas)', async () => {
    const json5Content = `{
      // This is a comment
      "identity": { "name": "JSON5Bot", },
      "gateway": { "port": 18789 }
    }`;
    await writeFile(configPath, json5Content, 'utf-8');
    const config = await readConfig(configPath);
    expect(config.identity?.name).toBe('JSON5Bot');
  });

  it('substitutes ${VAR} env variables', async () => {
    process.env.TEST_API_KEY = 'secret-key-123';
    const configWithEnv = {
      models: {
        providers: {
          anthropic: { apiKey: '${TEST_API_KEY}' },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(configWithEnv), 'utf-8');
    const config = await readConfig(configPath);
    expect(config.models?.providers?.anthropic?.apiKey).toBe('secret-key-123');
    delete process.env.TEST_API_KEY;
  });

  it('replaces unset env vars with empty string', async () => {
    const configWithEnv = {
      models: {
        providers: {
          test: { apiKey: '${NONEXISTENT_VAR_12345}' },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(configWithEnv), 'utf-8');
    const config = await readConfig(configPath);
    expect(config.models?.providers?.test?.apiKey).toBe('');
  });
});

describe('readConfigRaw', () => {
  it('does not substitute env variables', async () => {
    process.env.TEST_RAW_KEY = 'should-not-appear';
    const configWithEnv = {
      models: { providers: { test: { apiKey: '${TEST_RAW_KEY}' } } },
    };
    await writeFile(configPath, JSON.stringify(configWithEnv), 'utf-8');
    const config = await readConfigRaw(configPath);
    expect(config.models?.providers?.test?.apiKey).toBe('${TEST_RAW_KEY}');
    delete process.env.TEST_RAW_KEY;
  });
});

describe('$include resolution', () => {
  it('resolves $include directives', async () => {
    const agentsConfig = {
      defaults: { model: { primary: 'test-model' } },
      list: [{ id: 'included-agent', name: 'Included' }],
    };
    await writeFile(join(tempDir, 'agents.json'), JSON.stringify(agentsConfig), 'utf-8');

    const mainConfig = {
      identity: { name: 'Main' },
      agents: { $include: './agents.json' },
    };
    await writeFile(configPath, JSON.stringify(mainConfig), 'utf-8');

    const config = await readConfig(configPath);
    expect(config.agents?.list?.[0]?.id).toBe('included-agent');
  });
});

describe('writeConfig', () => {
  it('writes config atomically and creates backup', async () => {
    const newConfig: OpenClawConfig = {
      identity: { name: 'Updated' },
      gateway: { port: 9999 },
    };

    await writeConfig(newConfig, configPath);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.identity.name).toBe('Updated');
    expect(written.gateway.port).toBe(9999);
  });

  it('creates a backup file before writing', async () => {
    const { readdir } = await import('fs/promises');
    const filesBefore = await readdir(tempDir);
    const backupsBefore = filesBefore.filter(f => f.includes('.backup.'));

    await writeConfig({ identity: { name: 'New' } }, configPath);

    const filesAfter = await readdir(tempDir);
    const backupsAfter = filesAfter.filter(f => f.includes('.backup.'));
    expect(backupsAfter.length).toBe(backupsBefore.length + 1);
  });
});

describe('backupConfig', () => {
  it('creates a timestamped backup', async () => {
    const backupPath = await backupConfig(configPath);
    expect(backupPath).toContain('.backup.');
    const backupContent = await readFile(backupPath, 'utf-8');
    expect(JSON.parse(backupContent)).toEqual(sampleConfig);
  });

  it('returns empty string if source does not exist', async () => {
    const result = await backupConfig(join(tempDir, 'nonexistent.json'));
    expect(result).toBe('');
  });
});

describe('patchConfig', () => {
  it('deep merges a partial config', async () => {
    const result = await patchConfig(
      { identity: { name: 'Patched' } },
      configPath,
    );
    expect(result.identity?.name).toBe('Patched');
    expect(result.gateway?.port).toBe(18789); // preserved from original
  });

  it('replaces arrays entirely', async () => {
    const result = await patchConfig(
      { agents: { list: [{ id: 'new-agent', name: 'New' }] } },
      configPath,
    );
    expect(result.agents?.list).toHaveLength(1);
    expect(result.agents?.list?.[0]?.id).toBe('new-agent');
  });
});

describe('deepMerge', () => {
  it('deep merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10 }, e: 5 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3, e: 5 });
  });

  it('replaces arrays', () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3] });
    expect(result.arr).toEqual([3]);
  });

  it('handles null/undefined gracefully', () => {
    const result = deepMerge({ a: 1 }, { b: null as unknown as string });
    expect(result).toEqual({ a: 1, b: null });
  });
});

describe('getConfigValue', () => {
  it('gets nested values by dot-path', () => {
    expect(getConfigValue(sampleConfig, 'identity.name')).toBe('TestBot');
    expect(getConfigValue(sampleConfig, 'gateway.port')).toBe(18789);
    expect(getConfigValue(sampleConfig, 'agents.defaults.model.primary')).toBe(
      'anthropic/claude-sonnet-4-5',
    );
  });

  it('returns undefined for missing paths', () => {
    expect(getConfigValue(sampleConfig, 'nonexistent.path')).toBeUndefined();
    expect(getConfigValue(sampleConfig, 'identity.missing')).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  it('sets nested values by dot-path', () => {
    const result = setConfigValue(sampleConfig, 'identity.name', 'NewName');
    expect(result.identity?.name).toBe('NewName');
    // Original should be unchanged
    expect(sampleConfig.identity?.name).toBe('TestBot');
  });

  it('creates intermediate objects if needed', () => {
    const result = setConfigValue({}, 'deep.nested.value', 42);
    expect(getConfigValue(result, 'deep.nested.value')).toBe(42);
  });
});
