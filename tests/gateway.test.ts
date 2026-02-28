import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatewayClient, GatewayError } from '../src/gateway/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe('GatewayClient', () => {
  it('constructs with defaults', () => {
    const client = new GatewayClient();
    expect(client).toBeInstanceOf(GatewayClient);
  });

  it('constructs with custom URL and token', () => {
    const client = new GatewayClient('http://custom:9999', 'my-token');
    expect(client).toBeInstanceOf(GatewayClient);
  });

  describe('rpc', () => {
    it('makes a successful RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ result: { agents: 3 } }),
      );

      const client = new GatewayClient();
      const result = await client.rpc('health');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:18789/rpc');
      expect(JSON.parse(opts.body)).toEqual({ method: 'health', params: undefined });
      expect(result).toEqual({ agents: 3 });
    });

    it('sends auth token when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ result: 'ok' }));

      const client = new GatewayClient(undefined, 'secret-token');
      await client.rpc('test');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer secret-token');
    });

    it('throws GatewayError on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const client = new GatewayClient();
      await expect(client.rpc('test')).rejects.toThrow(GatewayError);
    });

    it('throws GatewayError on RPC error response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: { code: -32600, message: 'Invalid request' } }),
      );

      const client = new GatewayClient();
      await expect(client.rpc('test')).rejects.toThrow('Invalid request');
    });
  });

  describe('isReachable', () => {
    it('returns true when Gateway responds', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const client = new GatewayClient();
      expect(await client.isReachable()).toBe(true);
    });

    it('returns false when Gateway is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new GatewayClient();
      expect(await client.isReachable()).toBe(false);
    });
  });

  describe('health', () => {
    it('returns health status', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: 'ok', version: '1.2.3', agents: 5 }),
      );

      const client = new GatewayClient();
      const health = await client.health();
      expect(health.status).toBe('ok');
      expect(health.version).toBe('1.2.3');
    });

    it('returns error status when Gateway is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new GatewayClient();
      const health = await client.health();
      expect(health.status).toBe('error');
    });
  });

  describe('configApply', () => {
    it('sends full config via RPC', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ result: {} }));

      const client = new GatewayClient();
      await client.configApply({ identity: { name: 'Test' } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('config.apply');
      expect(body.params.raw).toBe(JSON.stringify({ identity: { name: 'Test' } }));
    });
  });

  describe('configPatch', () => {
    it('sends partial config via RPC', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ result: {} }));

      const client = new GatewayClient();
      await client.configPatch({ identity: { name: 'Patched' } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('config.patch');
      expect(body.params.patch.identity.name).toBe('Patched');
    });
  });

  describe('sessions', () => {
    it('lists sessions', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ result: [{ id: 'sess-1', agentId: 'a1' }] }),
      );

      const client = new GatewayClient();
      const sessions = await client.sessionsList();
      expect(sessions).toHaveLength(1);
    });

    it('kills a session', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ result: {} }));

      const client = new GatewayClient();
      await client.sessionsKill('sess-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('sessions.kill');
      expect(body.params.id).toBe('sess-1');
    });
  });

  describe('toolInvoke', () => {
    it('invokes a tool via RPC', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ result: 'done' }));

      const client = new GatewayClient();
      const result = await client.toolInvoke('cron', 'list', { filter: 'active' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('tools.invoke');
      expect(body.params).toEqual({ tool: 'cron', action: 'list', filter: 'active' });
    });
  });
});

describe('GatewayError', () => {
  it('has correct properties', () => {
    const err = new GatewayError('test error', 500, 'body');
    expect(err.name).toBe('GatewayError');
    expect(err.message).toBe('test error');
    expect(err.statusCode).toBe(500);
    expect(err.responseBody).toBe('body');
  });
});
