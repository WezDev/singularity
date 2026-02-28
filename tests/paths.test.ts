import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

// We need to test the module with different env vars, so we import dynamically
describe('paths', () => {
  it('expandTilde replaces ~ with home directory', async () => {
    const { expandTilde } = await import('../src/filesystem/paths.js');
    expect(expandTilde('~/foo/bar')).toBe(join(homedir(), 'foo/bar'));
    expect(expandTilde('~')).toBe(homedir());
    expect(expandTilde('/absolute/path')).toBe('/absolute/path');
    expect(expandTilde('relative/path')).toBe('relative/path');
  });

  it('resolvePath expands $HOME and tilde', async () => {
    const { resolvePath } = await import('../src/filesystem/paths.js');
    expect(resolvePath('$HOME/test')).toBe(join(homedir(), 'test'));
    expect(resolvePath('${HOME}/test')).toBe(join(homedir(), 'test'));
    expect(resolvePath('~/test')).toBe(join(homedir(), 'test'));
  });

  it('paths object has correct defaults', async () => {
    const { paths } = await import('../src/filesystem/paths.js');
    const home = join(homedir(), '.openclaw');
    expect(paths.home).toBe(home);
    expect(paths.config).toBe(join(home, 'openclaw.json'));
    expect(paths.skills).toBe(join(home, 'skills'));
    expect(paths.agent('test-agent')).toBe(join(home, 'agents', 'test-agent'));
    expect(paths.agentFile('test-agent', 'SOUL.md')).toBe(
      join(home, 'agents', 'test-agent', 'SOUL.md'),
    );
    expect(paths.skill('my-skill')).toBe(join(home, 'skills', 'my-skill'));
    expect(paths.cronJobs).toBe(join(home, 'cron', 'jobs.json'));
  });
});
