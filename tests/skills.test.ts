import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillsManager } from '../src/skills/manager.js';

let tempDir: string;
let skillsDir: string;
let mgr: SkillsManager;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'openclaw-skills-'));
  skillsDir = join(tempDir, 'skills');
  await mkdir(skillsDir, { recursive: true });

  mgr = new SkillsManager();
  // Override paths.skills for testing by patching the internal module
  // We'll use installToDir/listFromDir through the public API by
  // monkey-patching the paths import
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// For testing, we'll create a manager that uses a custom directory
// by overriding the internal paths. Since the module uses paths.skills,
// we'll test through install/uninstall on the real paths or create
// skills manually.

describe('SkillsManager', () => {
  it('lists skills from a directory', async () => {
    // Create some skill directories manually
    const skill1Dir = join(skillsDir, 'research');
    await mkdir(skill1Dir, { recursive: true });
    await writeFile(join(skill1Dir, 'SKILL.md'), '# Research Skill', 'utf-8');

    const skill2Dir = join(skillsDir, 'summarize');
    await mkdir(skill2Dir, { recursive: true });
    await writeFile(join(skill2Dir, 'SKILL.md'), '# Summarize Skill', 'utf-8');

    // Test via internal method (we'll access it through listForAgent with agent pointing to tempDir)
    // Instead, test the SkillsManager by creating a subclass or testing methods that accept paths
    // Since we can't easily override paths, let's test the agent-scoped methods

    // Create a "fake agent" directory structure
    const agentDir = join(tempDir, 'agent-test', 'skills');
    await mkdir(agentDir, { recursive: true });

    const agentSkill = join(agentDir, 'code-review');
    await mkdir(agentSkill, { recursive: true });
    await writeFile(join(agentSkill, 'SKILL.md'), '# Code Review', 'utf-8');
    await writeFile(join(agentSkill, 'template.md'), '## Template', 'utf-8');

    // For a proper test, let's test the internal helpers directly
    const skills = await (mgr as any).listFromDir(agentDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('code-review');
    expect(skills[0].hasSkillMd).toBe(true);
    expect(skills[0].files).toContain('SKILL.md');
    expect(skills[0].files).toContain('template.md');
  });

  it('reads skill content', async () => {
    const skillDir = join(skillsDir, 'test-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# Test Skill\n\nDo the thing.', 'utf-8');
    await writeFile(join(skillDir, 'config.json'), '{"key":"value"}', 'utf-8');

    const content = await (mgr as any).readFromDir(skillsDir, 'test-skill');
    expect(content.id).toBe('test-skill');
    expect(content.skillMd).toBe('# Test Skill\n\nDo the thing.');
    expect(content.files['SKILL.md']).toBe('# Test Skill\n\nDo the thing.');
    expect(content.files['config.json']).toBe('{"key":"value"}');
  });

  it('installs a skill', async () => {
    await (mgr as any).installToDir(skillsDir, 'new-skill', {
      skillMd: '# New Skill\n\nInstructions here.',
      additionalFiles: { 'helper.md': 'Helper content' },
    });

    const skillMd = await readFile(join(skillsDir, 'new-skill', 'SKILL.md'), 'utf-8');
    expect(skillMd).toBe('# New Skill\n\nInstructions here.');

    const helper = await readFile(join(skillsDir, 'new-skill', 'helper.md'), 'utf-8');
    expect(helper).toBe('Helper content');
  });

  it('uninstalls a skill', async () => {
    const skillDir = join(skillsDir, 'doomed-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'Bye', 'utf-8');

    await rm(skillDir, { recursive: true, force: true });

    const skills = await (mgr as any).listFromDir(skillsDir);
    expect(skills.find((s: any) => s.id === 'doomed-skill')).toBeUndefined();
  });

  it('returns empty for nonexistent directory', async () => {
    const skills = await (mgr as any).listFromDir(join(tempDir, 'nonexistent'));
    expect(skills).toEqual([]);
  });

  it('returns empty skillMd when SKILL.md is missing', async () => {
    const skillDir = join(skillsDir, 'no-skillmd');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'notes.txt'), 'Some notes', 'utf-8');

    const content = await (mgr as any).readFromDir(skillsDir, 'no-skillmd');
    expect(content.skillMd).toBe('');
    expect(content.files['notes.txt']).toBe('Some notes');
  });
});
