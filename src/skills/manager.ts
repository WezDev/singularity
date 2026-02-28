import { readFile, writeFile, readdir, mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { paths } from '../filesystem/paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Per-Agent Skills ─────────────────────────────────────────────────────────

/**
 * Resolve the skills directory for a given agent.
 * Agent-scoped skills live in the agent's workspace under a `skills/` subdirectory.
 */
function agentSkillsDir(agentId: string): string {
  return join(paths.agent(agentId), 'skills');
}

// ─── Skills Manager ───────────────────────────────────────────────────────────

/**
 * Manages OpenClaw skills (reusable instruction definitions).
 *
 * Skills are directories under `~/.openclaw/skills/` (global)
 * or `~/.openclaw/agents/<id>/skills/` (per-agent).
 * Each skill directory contains at minimum a `SKILL.md` file.
 */
export class SkillsManager {
  /**
   * List all global skills.
   */
  async list(): Promise<SkillInfo[]> {
    return this.listFromDir(paths.skills);
  }

  /**
   * List skills scoped to a specific agent.
   */
  async listForAgent(agentId: string): Promise<SkillInfo[]> {
    return this.listFromDir(agentSkillsDir(agentId));
  }

  /**
   * Read the full content of a global skill.
   */
  async read(id: string): Promise<SkillContent> {
    return this.readFromDir(paths.skills, id);
  }

  /**
   * Read the full content of an agent-scoped skill.
   */
  async readForAgent(agentId: string, skillId: string): Promise<SkillContent> {
    return this.readFromDir(agentSkillsDir(agentId), skillId);
  }

  /**
   * Install a global skill.
   */
  async install(id: string, options: InstallSkillOptions): Promise<void> {
    await this.installToDir(paths.skills, id, options);
  }

  /**
   * Install a skill scoped to a specific agent.
   */
  async installForAgent(
    agentId: string,
    skillId: string,
    options: InstallSkillOptions,
  ): Promise<void> {
    await this.installToDir(agentSkillsDir(agentId), skillId, options);
  }

  /**
   * Uninstall a global skill.
   */
  async uninstall(id: string): Promise<void> {
    await rm(join(paths.skills, id), { recursive: true, force: true });
  }

  /**
   * Uninstall an agent-scoped skill.
   */
  async uninstallForAgent(agentId: string, skillId: string): Promise<void> {
    await rm(join(agentSkillsDir(agentId), skillId), { recursive: true, force: true });
  }

  /**
   * Check if a global skill exists.
   */
  async exists(id: string): Promise<boolean> {
    try {
      await stat(join(paths.skills, id));
      return true;
    } catch {
      return false;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async listFromDir(baseDir: string): Promise<SkillInfo[]> {
    try {
      const entries = await readdir(baseDir, { withFileTypes: true });
      const skills: SkillInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = join(baseDir, entry.name);
        const files = await this.listFilesFlat(skillPath);
        skills.push({
          id: entry.name,
          path: skillPath,
          hasSkillMd: files.includes('SKILL.md'),
          files,
        });
      }

      return skills;
    } catch {
      return [];
    }
  }

  private async readFromDir(baseDir: string, id: string): Promise<SkillContent> {
    const skillPath = join(baseDir, id);
    const fileNames = await this.listFilesFlat(skillPath);
    const files: Record<string, string> = {};

    for (const name of fileNames) {
      try {
        files[name] = await readFile(join(skillPath, name), 'utf-8');
      } catch {
        // Skip unreadable files (binary, permissions, etc.)
      }
    }

    return {
      id,
      skillMd: files['SKILL.md'] || '',
      files,
    };
  }

  private async installToDir(
    baseDir: string,
    id: string,
    options: InstallSkillOptions,
  ): Promise<void> {
    const skillPath = join(baseDir, id);
    await mkdir(skillPath, { recursive: true });

    // Write SKILL.md
    await writeFile(join(skillPath, 'SKILL.md'), options.skillMd, 'utf-8');

    // Write additional files
    if (options.additionalFiles) {
      for (const [filename, content] of Object.entries(options.additionalFiles)) {
        await writeFile(join(skillPath, filename), content, 'utf-8');
      }
    }
  }

  private async listFilesFlat(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => e.name);
    } catch {
      return [];
    }
  }
}
