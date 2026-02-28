import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionsManager } from '../src/sessions/manager.js';
import { GatewayClient } from '../src/gateway/client.js';

describe('SessionsManager', () => {
  const mockGateway = {
    rpc: vi.fn(),
  } as unknown as GatewayClient;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists all sessions', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { id: 's1', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
      { id: 's2', agentId: 'a2', active: false, startedAt: '2026-01-01T01:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const sessions = await mgr.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('s1');
    expect(sessions[0].active).toBe(true);
  });

  it('filters by agentId', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { id: 's1', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
      { id: 's2', agentId: 'a2', active: true, startedAt: '2026-01-01T01:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const sessions = await mgr.list({ agentId: 'a1' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].agentId).toBe('a1');
  });

  it('filters activeOnly', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { id: 's1', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
      { id: 's2', agentId: 'a2', active: false, startedAt: '2026-01-01T01:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const sessions = await mgr.list({ activeOnly: true });
    expect(sessions).toHaveLength(1);
  });

  it('normalizes different Gateway response shapes', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { sessionId: 'x', agent: 'bot', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const sessions = await mgr.list();
    expect(sessions[0].id).toBe('x');
    expect(sessions[0].agentId).toBe('bot');
    expect(sessions[0].startedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('returns empty array when Gateway is down', async () => {
    (mockGateway.rpc as any).mockRejectedValueOnce(new Error('Connection refused'));

    const mgr = new SessionsManager(mockGateway);
    const sessions = await mgr.list();
    expect(sessions).toEqual([]);
  });

  it('gets a specific session', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { id: 's1', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const session = await mgr.get('s1');
    expect(session?.id).toBe('s1');
  });

  it('returns null for nonexistent session', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([]);

    const mgr = new SessionsManager(mockGateway);
    const session = await mgr.get('nonexistent');
    expect(session).toBeNull();
  });

  it('kills a session', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce(undefined);

    const mgr = new SessionsManager(mockGateway);
    await mgr.kill('s1');

    expect(mockGateway.rpc).toHaveBeenCalledWith('sessions.kill', { id: 's1' });
  });

  it('counts active sessions', async () => {
    (mockGateway.rpc as any).mockResolvedValueOnce([
      { id: 's1', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
      { id: 's2', agentId: 'a1', active: false, startedAt: '2026-01-01T00:00:00Z' },
      { id: 's3', agentId: 'a1', active: true, startedAt: '2026-01-01T00:00:00Z' },
    ]);

    const mgr = new SessionsManager(mockGateway);
    const count = await mgr.countActive('a1');
    expect(count).toBe(2);
  });
});
