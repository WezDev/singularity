export interface SkillInfo {
    /** Directory name (skill ID) */
    id: string;
    /** Absolute path to the skill directory */
    path: string;
    /** Whether a SKILL.md file exists */
    hasSkillMd: boolean;
    /** List of all files in the skill directory */
    files: string[];
}
export interface SkillContent {
    /** Skill directory name */
    id: string;
    /** Contents of SKILL.md, or empty string if not found */
    skillMd: string;
    /** All files in the skill directory, keyed by filename */
    files: Record<string, string>;
}
export interface InstallSkillOptions {
    /** Contents of SKILL.md (required) */
    skillMd: string;
    /** Additional files to include, keyed by filename */
    additionalFiles?: Record<string, string>;
}
/**
 * Manages OpenClaw skills (reusable instruction definitions).
 *
 * Skills are directories under `~/.openclaw/skills/` (global)
 * or `~/.openclaw/agents/<id>/skills/` (per-agent).
 * Each skill directory contains at minimum a `SKILL.md` file.
 */
export declare class SkillsManager {
    /**
     * List all global skills.
     */
    list(): Promise<SkillInfo[]>;
    /**
     * List skills scoped to a specific agent.
     */
    listForAgent(agentId: string): Promise<SkillInfo[]>;
    /**
     * Read the full content of a global skill.
     */
    read(id: string): Promise<SkillContent>;
    /**
     * Read the full content of an agent-scoped skill.
     */
    readForAgent(agentId: string, skillId: string): Promise<SkillContent>;
    /**
     * Install a global skill.
     */
    install(id: string, options: InstallSkillOptions): Promise<void>;
    /**
     * Install a skill scoped to a specific agent.
     */
    installForAgent(agentId: string, skillId: string, options: InstallSkillOptions): Promise<void>;
    /**
     * Uninstall a global skill.
     */
    uninstall(id: string): Promise<void>;
    /**
     * Uninstall an agent-scoped skill.
     */
    uninstallForAgent(agentId: string, skillId: string): Promise<void>;
    /**
     * Check if a global skill exists.
     */
    exists(id: string): Promise<boolean>;
    private listFromDir;
    private readFromDir;
    private installToDir;
    private listFilesFlat;
}
//# sourceMappingURL=manager.d.ts.map