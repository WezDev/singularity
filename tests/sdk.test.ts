import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { OpenClawSDK } from '../src/index.js';
import type { OpenClawConfig } from '../src/config/schema.js';

let tempDir: string;
let configPath: string;

const sampleConfig: OpenClawConfig = {
  identity: { name: 'TestBot', emoji: '🤖' },
  gateway: { port: 18789 },
  agents: {
    list: [{ id: 'agent-1', name: 'Agent One' }],
  },
  channels: { telegram: { enabled: true } },
  models: {
    providers: {
      anthropic: { apiKey: 'test-key', api: 'anthropic' },
    },
  },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'openclaw-sdk-'));
  configPath = join(tempDir, 'openclaw.json');
  await writeFile(configPath, JSON.stringify(sampleConfig, null, 2), 'utf-8');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('OpenClawSDK', () => {
  it('constructs with defaults', () => {
    const sdk = new OpenClawSDK({ configPath });
    expect(sdk).toBeInstanceOf(OpenClawSDK);
    sdk.close();
  });

  it('config.read works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const config = await sdk.config.read();
    expect(config.identity?.name).toBe('TestBot');
    sdk.close();
  });

  it('config.readRaw works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const config = await sdk.config.readRaw();
    expect(config.identity?.name).toBe('TestBot');
    sdk.close();
  });

  it('config.patch works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    await sdk.config.patch({ identity: { name: 'Patched' } });
    const config = await sdk.config.read();
    expect(config.identity?.name).toBe('Patched');
    sdk.close();
  });

  it('config.get works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const name = await sdk.config.get('identity.name');
    expect(name).toBe('TestBot');
    sdk.close();
  });

  it('config.set works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    await sdk.config.set('identity.name', 'SetViaPath');
    const config = await sdk.config.read();
    expect(config.identity?.name).toBe('SetViaPath');
    sdk.close();
  });

  it('config.validate works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const result = await sdk.config.validate();
    expect(result.valid).toBe(true);
    sdk.close();
  });

  it('agents accessor returns AgentManager', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const agents = await sdk.agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('agent-1');
    sdk.close();
  });

  it('gateway accessor returns GatewayClient', () => {
    const sdk = new OpenClawSDK({ configPath });
    expect(sdk.gateway).toBeDefined();
    expect(typeof sdk.gateway.isReachable).toBe('function');
    sdk.close();
  });

  it('cron accessor returns CronManager', () => {
    const sdk = new OpenClawSDK({ configPath });
    expect(sdk.cron).toBeDefined();
    expect(typeof sdk.cron.list).toBe('function');
    sdk.close();
  });

  it('sessions accessor returns SessionsManager', () => {
    const sdk = new OpenClawSDK({ configPath });
    expect(sdk.sessions).toBeDefined();
    expect(typeof sdk.sessions.list).toBe('function');
    sdk.close();
  });

  it('skills accessor returns SkillsManager', () => {
    const sdk = new OpenClawSDK({ configPath });
    expect(sdk.skills).toBeDefined();
    expect(typeof sdk.skills.list).toBe('function');
    sdk.close();
  });

  it('db accessor lazily creates StateDatabase', () => {
    const dbPath = join(tempDir, 'state.db');
    const sdk = new OpenClawSDK({ configPath, dbPath });
    const db = sdk.db;
    expect(db).toBeDefined();
    expect(typeof db.runs.listRecent).toBe('function');
    sdk.close();
  });

  it('identity convenience accessor works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const identity = await sdk.identity.get();
    expect(identity?.name).toBe('TestBot');
    sdk.close();
  });

  it('identity.set works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    await sdk.identity.set({ name: 'NewName', emoji: '🚀' });
    const identity = await sdk.identity.get();
    expect(identity?.name).toBe('NewName');
    sdk.close();
  });

  it('channels.list works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const channels = await sdk.channels.list();
    expect(channels.telegram?.enabled).toBe(true);
    sdk.close();
  });

  it('models.listProviders works', async () => {
    const sdk = new OpenClawSDK({ configPath });
    const providers = await sdk.models.listProviders();
    expect(providers.anthropic).toBeDefined();
    sdk.close();
  });

  it('close is idempotent', () => {
    const dbPath = join(tempDir, 'state.db');
    const sdk = new OpenClawSDK({ configPath, dbPath });
    sdk.db; // Initialize DB
    sdk.close();
    sdk.close(); // Should not throw
  });
});
