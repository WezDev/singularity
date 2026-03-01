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

export class SkillsModule {
    constructor(private config: ResolvedSDKConfig) {}

    async list(): Promise<Skill[]> {
        const dir = this.config.skillsDir;
        if (!existsSync(dir)) return [];

        const entries = readdirSync(dir, { withFileTypes: true });
        const skills: Skill[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skill = this.readSkill(entry.name);
            if (skill) skills.push(skill);
        }

        return skills;
    }

    async get(skillId: string): Promise<Skill> {
        const skill = this.readSkill(skillId);
        if (!skill) throw new NotFoundError("Skill", skillId);
        return skill;
    }

    async create(params: CreateSkillParams): Promise<Skill> {
        const skillDir = resolve(this.config.skillsDir, params.id);
        mkdirSync(skillDir, { recursive: true });

        const skillMd = buildSkillMd(params.description, params.content);
        writeFileSync(join(skillDir, "SKILL.md"), skillMd);

        if (params.files) {
            for (const [filename, content] of Object.entries(params.files)) {
                writeFileSync(join(skillDir, filename), content);
            }
        }

        return {
            id: params.id,
            path: skillDir,
            type: "workspace",
            hasSkillMd: true,
            description: params.description,
            content: params.content,
        };
    }

    async update(skillId: string, params: UpdateSkillParams): Promise<Skill> {
        const skill = await this.get(skillId);

        if (params.description !== undefined || params.content !== undefined) {
            const description = params.description ?? skill.description ?? "";
            const content = params.content ?? skill.content ?? "";
            const skillMd = buildSkillMd(description, content);
            writeFileSync(join(skill.path, "SKILL.md"), skillMd);
        }

        if (params.files) {
            for (const [filename, content] of Object.entries(params.files)) {
                writeFileSync(join(skill.path, filename), content);
            }
        }

        return {
            ...skill,
            description: params.description ?? skill.description,
            content: params.content ?? skill.content,
        };
    }

    async delete(skillId: string): Promise<void> {
        const skillDir = resolve(this.config.skillsDir, skillId);
        if (!existsSync(skillDir)) throw new NotFoundError("Skill", skillId);
        rmSync(skillDir, { recursive: true, force: true });
    }

    private readSkill(skillId: string): Skill | null {
        const skillDir = resolve(this.config.skillsDir, skillId);
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
        };
    }
}
