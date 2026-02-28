import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { AgentManager, AgentWorkspace } from '../src/agents/manager.js';
import type { OpenClawConfig } from '../src/config/schema.js';

let tempDir: string;
let configPath: string;

const baseConfig: OpenClawConfig = {
  agents: {
    defaults: { model: { primary: 'anthropic/claude-sonnet-4-5' } },
    list: [
      { id: 'agent-1', name: 'Agent One' },
      { id: 'agent-2', name: 'Agent Two', default: true },
    ],
    bindings: [
      { agentId: 'agent-1', match: { channel: 'telegram' } },
    ],
  },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'openclaw-agents-'));
  configPath = join(tempDir, 'openclaw.json');
  await writeFile(configPath, JSON.stringify(baseConfig, null, 2), 'utf-8');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('AgentManager', () => {
  it('lists all agents', async () => {
    const mgr = new AgentManager(configPath);
    const agents = await mgr.list();
    expect(agents).toHaveLength(2);
    expect(agents[0].id).toBe('agent-1');
  });

  it('gets a specific agent', async () => {
    const mgr = new AgentManager(configPath);
    const agent = await mgr.get('agent-2');
    expect(agent?.name).toBe('Agent Two');
  });

  it('returns undefined for missing agent', async () => {
    const mgr = new AgentManager(configPath);
    const agent = await mgr.get('nonexistent');
    expect(agent).toBeUndefined();
  });

  it('creates a new agent', async () => {
    const mgr = new AgentManager(configPath);
    await mgr.create(
      { id: 'new-agent', name: 'New Agent' },
      { initWorkspace: false },
    );

    const agents = await mgr.list();
    expect(agents).toHaveLength(3);
    expect(agents[2].id).toBe('new-agent');
  });

  it('rejects duplicate agent ID', async () => {
    const mgr = new AgentManager(configPath);
    await expect(
      mgr.create({ id: 'agent-1', name: 'Dupe' }, { initWorkspace: false }),
    ).rejects.toThrow('already exists');
  });

  it('rejects invalid agent ID', async () => {
    const mgr = new AgentManager(configPath);
    await expect(
      mgr.create({ id: 'has spaces', name: 'Bad' }, { initWorkspace: false }),
    ).rejects.toThrow('Invalid agent ID');
  });

  it('updates an existing agent', async () => {
    const mgr = new AgentManager(configPath);
    await mgr.update('agent-1', { name: 'Updated Name' });

    const agent = await mgr.get('agent-1');
    expect(agent?.name).toBe('Updated Name');
  });

  it('throws when updating nonexistent agent', async () => {
    const mgr = new AgentManager(configPath);
    await expect(
      mgr.update('nonexistent', { name: 'No' }),
    ).rejects.toThrow('not found');
  });

  it('deletes an agent and removes bindings', async () => {
    const mgr = new AgentManager(configPath);
    await mgr.delete('agent-1');

    const agents = await mgr.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('agent-2');

    // Binding for agent-1 should be removed
    const config = JSON.parse(await readFile(configPath, 'utf-8')) as OpenClawConfig;
    expect(config.agents?.bindings).toHaveLength(0);
  });

  it('throws when deleting nonexistent agent', async () => {
    const mgr = new AgentManager(configPath);
    await expect(mgr.delete('nonexistent')).rejects.toThrow('not found');
  });

  it('sets default agent', async () => {
    const mgr = new AgentManager(configPath);
    await mgr.setDefault('agent-1');

    const agents = await mgr.list();
    expect(agents.find(a => a.id === 'agent-1')?.default).toBe(true);
    expect(agents.find(a => a.id === 'agent-2')?.default).toBe(false);
  });

  it('throws when setting default for nonexistent agent', async () => {
    const mgr = new AgentManager(configPath);
    await expect(mgr.setDefault('nonexistent')).rejects.toThrow('not found');
  });
});

describe('AgentWorkspace', () => {
  let workspaceDir: string;
  let workspace: AgentWorkspace;

  beforeEach(() => {
    // Override the workspace to use tempDir
    workspaceDir = join(tempDir, 'agents', 'test-agent');
    workspace = new AgentWorkspace('test-agent');
    // Monkey-patch basePath for testing
    (workspace as any).basePath = workspaceDir;
  });

  it('initializes workspace with template files', async () => {
    await workspace.init({ id: 'test-agent', name: 'Test Agent' });

    const files = await workspace.listFiles();
    expect(files).toContain('AGENTS.md');
    expect(files).toContain('SOUL.md');
    expect(files).toContain('IDENTITY.md');
  });

  it('does not overwrite existing files on init', async () => {
    const { mkdir } = await import('fs/promises');
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, 'AGENTS.md'), 'Custom content', 'utf-8');

    await workspace.init({ id: 'test-agent', name: 'Test' });

    const content = await workspace.readFile('AGENTS.md');
    expect(content).toBe('Custom content');
  });

  it('reads and writes files', async () => {
    await workspace.init();
    await workspace.writeFile('notes.txt', 'Hello world');
    const content = await workspace.readFile('notes.txt');
    expect(content).toBe('Hello world');
  });

  it('lists files in workspace', async () => {
    await workspace.init();
    const files = await workspace.listFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for nonexistent workspace', async () => {
    const empty = new AgentWorkspace('nonexistent');
    (empty as any).basePath = join(tempDir, 'nonexistent');
    const files = await empty.listFiles();
    expect(files).toEqual([]);
  });

  it('reports existence correctly', async () => {
    expect(await workspace.exists()).toBe(false);
    await workspace.init();
    expect(await workspace.exists()).toBe(true);
  });

  it('destroys workspace', async () => {
    await workspace.init();
    expect(await workspace.exists()).toBe(true);
    await workspace.destroy();
    expect(await workspace.exists()).toBe(false);
  });
});
