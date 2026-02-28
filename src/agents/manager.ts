import { mkdir, rm, readFile, writeFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { paths, expandTilde } from '../filesystem/paths.js';
import { readConfig, writeConfig } from '../config/reader.js';
import type { AgentEntry, OpenClawConfig } from '../config/schema.js';

/**
 * Manages OpenClaw agents in the config and filesystem.
 */
export class AgentManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || paths.config;
  }

  /**
   * List all agents defined in the config.
   */
  async list(): Promise<AgentEntry[]> {
    const config = await readConfig(this.configPath);
    return config.agents?.list || [];
  }

  /**
   * Get a specific agent by ID.
   */
  async get(id: string): Promise<AgentEntry | undefined> {
    const agents = await this.list();
    return agents.find(a => a.id === id);
  }

  /**
   * Create a new agent. Adds to config and optionally initializes workspace.
   */
  async create(
    agent: AgentEntry,
    options: { initWorkspace?: boolean } = { initWorkspace: true },
  ): Promise<void> {
    const config = await readConfig(this.configPath);

    // Validate no ID collision
    const existing = config.agents?.list?.find(a => a.id === agent.id);
    if (existing) {
      throw new Error(`Agent "${agent.id}" already exists`);
    }

    // Validate agent ID format (Antfarm uses underscore namespace separator)
    if (!/^[a-zA-Z0-9_-]+$/.test(agent.id)) {
      throw new Error(
        `Invalid agent ID "${agent.id}". Use only letters, numbers, hyphens, and underscores.`,
      );
    }

    // Initialize agents section if needed
    config.agents = config.agents || {};
    config.agents.list = config.agents.list || [];
    config.agents.list.push(agent);

    await writeConfig(config, this.configPath);

    // Initialize workspace
    if (options.initWorkspace) {
      await this.workspace(agent.id).init(agent);
    }
  }

  /**
   * Update an existing agent's configuration.
   */
  async update(id: string, updates: Partial<AgentEntry>): Promise<void> {
    const config = await readConfig(this.configPath);
    const list = config.agents?.list || [];
    const index = list.findIndex(a => a.id === id);

    if (index === -1) {
      throw new Error(`Agent "${id}" not found`);
    }

    // Merge updates (don't allow changing the ID)
    const { id: _ignoreId, ...safeUpdates } = updates;
    list[index] = { ...list[index], ...safeUpdates };

    await writeConfig(config, this.configPath);
  }

  /**
   * Delete an agent from config and optionally remove workspace.
   */
  async delete(
    id: string,
    options: { removeWorkspace?: boolean } = { removeWorkspace: false },
  ): Promise<void> {
    const config = await readConfig(this.configPath);
    const list = config.agents?.list || [];
    const index = list.findIndex(a => a.id === id);

    if (index === -1) {
      throw new Error(`Agent "${id}" not found`);
    }

    // Remove from list
    list.splice(index, 1);

    // Also remove any bindings referencing this agent
    if (config.agents?.bindings) {
      config.agents.bindings = config.agents.bindings.filter(
        b => b.agentId !== id,
      );
    }

    await writeConfig(config, this.configPath);

    if (options.removeWorkspace) {
      await this.workspace(id).destroy();
    }
  }

  /**
   * Set an agent as the default.
   */
  async setDefault(id: string): Promise<void> {
    const config = await readConfig(this.configPath);
    const list = config.agents?.list || [];

    // Unset current default
    for (const agent of list) {
      agent.default = agent.id === id;
    }

    // Verify the target agent exists
    if (!list.find(a => a.id === id)) {
      throw new Error(`Agent "${id}" not found`);
    }

    await writeConfig(config, this.configPath);
  }

  /**
   * Get workspace operations for a specific agent.
   */
  workspace(id: string): AgentWorkspace {
    return new AgentWorkspace(id);
  }
}

/**
 * Manages an individual agent's workspace directory.
 */
export class AgentWorkspace {
  readonly agentId: string;
  readonly basePath: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.basePath = paths.agent(agentId);
  }

  /**
   * Initialize the workspace directory with template files.
   */
  async init(agent?: AgentEntry): Promise<void> {
    await mkdir(this.basePath, { recursive: true });

    // Create default workspace files if they don't exist
    const defaults: Record<string, string> = {
      'AGENTS.md': this.defaultAgentsMd(agent),
      'SOUL.md': this.defaultSoulMd(agent),
      'IDENTITY.md': this.defaultIdentityMd(agent),
    };

    for (const [filename, content] of Object.entries(defaults)) {
      const filepath = join(this.basePath, filename);
      try {
        await stat(filepath);
        // File exists, don't overwrite
      } catch {
        await writeFile(filepath, content, 'utf-8');
      }
    }
  }

  /**
   * Read a file from the workspace.
   */
  async readFile(filename: string): Promise<string> {
    const filepath = join(this.basePath, filename);
    return readFile(filepath, 'utf-8');
  }

  /**
   * Write a file to the workspace.
   */
  async writeFile(filename: string, content: string): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    const filepath = join(this.basePath, filename);
    await writeFile(filepath, content, 'utf-8');
  }

  /**
   * List all files in the workspace.
   */
  async listFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Remove the workspace directory.
   */
  async destroy(): Promise<void> {
    await rm(this.basePath, { recursive: true, force: true });
  }

  /**
   * Check if the workspace exists.
   */
  async exists(): Promise<boolean> {
    try {
      await stat(this.basePath);
      return true;
    } catch {
      return false;
    }
  }

  // ---- Default template content ----

  private defaultAgentsMd(agent?: AgentEntry): string {
    const name = agent?.name || agent?.id || 'Agent';
    return `# ${name}

## Instructions

You are ${name}. Follow the instructions below.

## Workspace

Your workspace is at \`${this.basePath}\`.
`;
  }

  private defaultSoulMd(agent?: AgentEntry): string {
    const name = agent?.name || agent?.id || 'Agent';
    return `# Soul

You are ${name}. You are helpful, thorough, and focused on the task at hand.
`;
  }

  private defaultIdentityMd(agent?: AgentEntry): string {
    const name = agent?.name || agent?.id || 'Agent';
    const role = agent?.role || 'general';
    return `# Identity

- **Name:** ${name}
- **Role:** ${role}
`;
  }
}
