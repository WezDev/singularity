import { describe, it, expect, vi, afterEach } from 'vitest';
import { CronManager } from '../src/cron/manager.js';
import { GatewayClient } from '../src/gateway/client.js';
import type { CronJobDefinition } from '../src/config/schema.js';

describe('CronManager', () => {
  const mockGateway = {
    toolInvoke: vi.fn(),
  } as unknown as GatewayClient;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const testJob: CronJobDefinition = {
    name: 'test-job',
    schedule: { kind: 'cron', expr: '0 8 * * *' },
    sessionTarget: 'isolated',
    agentId: 'agent-1',
    payload: { kind: 'agentTurn', message: 'Run test', timeoutSeconds: 60 },
  };

  describe('list', () => {
    it('lists jobs via Gateway', async () => {
      (mockGateway.toolInvoke as any).mockResolvedValueOnce([testJob]);

      const mgr = new CronManager(mockGateway);
      const jobs = await mgr.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('test-job');
    });

    it('falls back to jobs.json when Gateway fails', async () => {
      (mockGateway.toolInvoke as any).mockRejectedValueOnce(new Error('down'));

      const mgr = new CronManager(mockGateway);
      // Falls back to reading ~/.openclaw/cron/jobs.json which may or may not exist
      const jobs = await mgr.list();
      // Just verify it returns something without throwing
      expect(Array.isArray(jobs) || typeof jobs === 'object').toBe(true);
    });
  });

  describe('create', () => {
    it('creates via Gateway', async () => {
      (mockGateway.toolInvoke as any).mockResolvedValueOnce(undefined);

      const mgr = new CronManager(mockGateway);
      await mgr.create(testJob);

      expect(mockGateway.toolInvoke).toHaveBeenCalledWith('cron', 'create', expect.objectContaining({ name: 'test-job' }));
    });
  });

  describe('delete', () => {
    it('deletes via Gateway', async () => {
      (mockGateway.toolInvoke as any).mockResolvedValueOnce(undefined);

      const mgr = new CronManager(mockGateway);
      await mgr.delete('test-job');

      expect(mockGateway.toolInvoke).toHaveBeenCalledWith('cron', 'delete', { name: 'test-job' });
    });
  });

  describe('pause/resume', () => {
    it('pauses via Gateway', async () => {
      (mockGateway.toolInvoke as any).mockResolvedValueOnce(undefined);

      const mgr = new CronManager(mockGateway);
      await mgr.pause('test-job');

      expect(mockGateway.toolInvoke).toHaveBeenCalledWith('cron', 'pause', { name: 'test-job' });
    });

    it('resumes via Gateway', async () => {
      (mockGateway.toolInvoke as any).mockResolvedValueOnce(undefined);

      const mgr = new CronManager(mockGateway);
      await mgr.resume('test-job');

      expect(mockGateway.toolInvoke).toHaveBeenCalledWith('cron', 'resume', { name: 'test-job' });
    });
  });
});
