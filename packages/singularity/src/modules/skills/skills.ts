import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ResolvedSDKConfig, Skill, CreateSkillParams, UpdateSkillParams } from "../types.js";
import { NotFoundError } from "../errors.js";

function buildSkillMd(description: string, content: string): string {
    return `---\ndescription: ${JSON.stringify(description)}\n---\n\n${content}`;
}

function parseFrontmatter(raw: string): { description?: string; content: string } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { content: raw };

    const frontmatter = match[1];
    const content = (match[2] ?? "").replace(/^\n+/, "");

    const descMatch = frontmatter.match(/^description:\s*"?(.*?)"?\s*$/m);
    return {
        description: descMatch?.[1],
        content,
    };
}

interface TargetDir {
    dir: string;
    scope: "global" | "agent";
    agentId?: string;
}

export class SkillsModule {
    constructor(private config: ResolvedSDKConfig) {}

    private agentSkillsDir(agentId: string): string {
        return resolve(this.config.agentsBaseDir, agentId, "skills");
    }

    private resolveTargetDirs(target?: "global" | string[]): TargetDir[] {
        if (!target || target === "global") {
            return [{ dir: this.config.skillsDir, scope: "global" }];
        }

        const dirs: TargetDir[] = [];
        for (const entry of target) {
            if (entry === "global") {
                dirs.push({ dir: this.config.skillsDir, scope: "global" });
            } else {
                dirs.push({ dir: this.agentSkillsDir(entry), scope: "agent", agentId: entry });
            }
        }
        return dirs;
    }

    async list(options?: { agentId?: string }): Promise<Skill[]> {
        const baseDir = options?.agentId
            ? this.agentSkillsDir(options.agentId)
            : this.config.skillsDir;
        const scope: "global" | "agent" = options?.agentId ? "agent" : "global";

        if (!existsSync(baseDir)) return [];

        const entries = readdirSync(baseDir, { withFileTypes: true });
        const skills: Skill[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skill = this.readSkill(entry.name, baseDir, scope, options?.agentId);
            if (skill) skills.push(skill);
        }

        return skills;
    }

    async get(skillId: string, options?: { agentId?: string }): Promise<Skill> {
        const baseDir = options?.agentId
            ? this.agentSkillsDir(options.agentId)
            : this.config.skillsDir;
        const scope: "global" | "agent" = options?.agentId ? "agent" : "global";

        const skill = this.readSkill(skillId, baseDir, scope, options?.agentId);
        if (!skill) throw new NotFoundError("Skill", skillId);
        return skill;
    }

    async create(params: CreateSkillParams): Promise<Skill> {
        const targetDirs = this.resolveTargetDirs(params.target);
        let firstSkill: Skill | undefined;

        for (const { dir, scope, agentId } of targetDirs) {
            const skillDir = resolve(dir, params.id);
            mkdirSync(skillDir, { recursive: true });

            const skillMd = buildSkillMd(params.description, params.content);
            writeFileSync(join(skillDir, "SKILL.md"), skillMd);

            if (params.files) {
                for (const [filename, content] of Object.entries(params.files)) {
                    writeFileSync(join(skillDir, filename), content);
                }
            }

            if (!firstSkill) {
                firstSkill = {
                    id: params.id,
                    path: skillDir,
                    type: "workspace",
                    hasSkillMd: true,
                    description: params.description,
                    content: params.content,
                    scope,
                    agentId,
                };
            }
        }

        return firstSkill!;
    }

    async update(skillId: string, params: UpdateSkillParams): Promise<Skill> {
        const targetDirs = params.target
            ? this.resolveTargetDirs(params.target)
            : [{ dir: this.config.skillsDir, scope: "global" as const }];

        let firstSkill: Skill | undefined;

        for (const { dir, scope, agentId } of targetDirs) {
            const skillDir = resolve(dir, skillId);
            const existing = this.readSkill(skillId, dir, scope, agentId);

            if (params.description !== undefined || params.content !== undefined) {
                const description = params.description ?? existing?.description ?? "";
                const content = params.content ?? existing?.content ?? "";
                mkdirSync(skillDir, { recursive: true });
                const skillMd = buildSkillMd(description, content);
                writeFileSync(join(skillDir, "SKILL.md"), skillMd);
            }

            if (params.files) {
                mkdirSync(skillDir, { recursive: true });
                for (const [filename, content] of Object.entries(params.files)) {
                    writeFileSync(join(skillDir, filename), content);
                }
            }

            if (!firstSkill) {
                firstSkill = {
                    id: skillId,
                    path: skillDir,
                    type: "workspace",
                    hasSkillMd: true,
                    description: params.description ?? existing?.description,
                    content: params.content ?? existing?.content,
                    scope,
                    agentId,
                };
            }
        }

        // If no target was specified and the skill wasn't found in global, throw
        if (!params.target && !existsSync(resolve(this.config.skillsDir, skillId))) {
            throw new NotFoundError("Skill", skillId);
        }

        return firstSkill!;
    }

    async delete(skillId: string, options?: { agentId?: string }): Promise<void> {
        const baseDir = options?.agentId
            ? this.agentSkillsDir(options.agentId)
            : this.config.skillsDir;

        const skillDir = resolve(baseDir, skillId);
        if (!existsSync(skillDir)) throw new NotFoundError("Skill", skillId);
        rmSync(skillDir, { recursive: true, force: true });
    }

    private readSkill(
        skillId: string,
        baseDir: string = this.config.skillsDir,
        scope: "global" | "agent" = "global",
        agentId?: string,
    ): Skill | null {
        const skillDir = resolve(baseDir, skillId);
        if (!existsSync(skillDir)) return null;

        const skillMdPath = join(skillDir, "SKILL.md");
        const hasSkillMd = existsSync(skillMdPath);
        let content: string | undefined;
        let description: string | undefined;

        if (hasSkillMd) {
            const raw = readFileSync(skillMdPath, "utf-8");
            const parsed = parseFrontmatter(raw);
            description = parsed.description;
            content = parsed.content;
        }

        return {
            id: skillId,
            path: skillDir,
            type: "workspace",
            hasSkillMd,
            description,
            content,
            scope,
            agentId,
        };
    }
}
