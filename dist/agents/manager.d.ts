import type { AgentEntry } from '../config/schema.js';
/**
 * Manages OpenClaw agents in the config and filesystem.
 */
export declare class AgentManager {
    private configPath;
    constructor(configPath?: string);
    /**
     * List all agents defined in the config.
     */
    list(): Promise<AgentEntry[]>;
    /**
     * Get a specific agent by ID.
     */
    get(id: string): Promise<AgentEntry | undefined>;
    /**
     * Create a new agent. Adds to config and optionally initializes workspace.
     */
    create(agent: AgentEntry, options?: {
        initWorkspace?: boolean;
    }): Promise<void>;
    /**
     * Update an existing agent's configuration.
     */
    update(id: string, updates: Partial<AgentEntry>): Promise<void>;
    /**
     * Delete an agent from config and optionally remove workspace.
     */
    delete(id: string, options?: {
        removeWorkspace?: boolean;
    }): Promise<void>;
    /**
     * Set an agent as the default.
     */
    setDefault(id: string): Promise<void>;
    /**
     * Get workspace operations for a specific agent.
     */
    workspace(id: string): AgentWorkspace;
}
/**
 * Manages an individual agent's workspace directory.
 */
export declare class AgentWorkspace {
    readonly agentId: string;
    readonly basePath: string;
    constructor(agentId: string);
    /**
     * Initialize the workspace directory with template files.
     */
    init(agent?: AgentEntry): Promise<void>;
    /**
     * Read a file from the workspace.
     */
    readFile(filename: string): Promise<string>;
    /**
     * Write a file to the workspace.
     */
    writeFile(filename: string, content: string): Promise<void>;
    /**
     * List all files in the workspace.
     */
    listFiles(): Promise<string[]>;
    /**
     * Remove the workspace directory.
     */
    destroy(): Promise<void>;
    /**
     * Check if the workspace exists.
     */
    exists(): Promise<boolean>;
    private defaultAgentsMd;
    private defaultSoulMd;
    private defaultIdentityMd;
}
//# sourceMappingURL=manager.d.ts.map