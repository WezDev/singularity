import type { OpenClawConfig } from '../config/schema.js';

export interface GatewayHealth {
  status: 'ok' | 'degraded' | 'error';
  version?: string;
  uptime?: number;
  agents?: number;
}

export interface RPCResponse<T = unknown> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * HTTP client for the OpenClaw Gateway API.
 *
 * The Gateway runs at http://127.0.0.1:18789 by default and exposes
 * RPC endpoints for configuration, health, and tool invocation.
 */
export class GatewayClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl?: string, authToken?: string) {
    this.baseUrl = (baseUrl || 'http://127.0.0.1:18789').replace(/\/$/, '');
    this.authToken = authToken;
  }

  /**
   * Make an RPC call to the Gateway.
   */
  async rpc<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, params }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GatewayError(
        `Gateway RPC "${method}" failed: ${res.status} ${res.statusText}`,
        res.status,
        text,
      );
    }

    const data = (await res.json()) as RPCResponse<T>;

    if (data.error) {
      throw new GatewayError(
        `Gateway RPC "${method}" error: ${data.error.message}`,
        data.error.code,
      );
    }

    return data.result as T;
  }

  /**
   * Check if the Gateway is reachable.
   */
  async isReachable(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Gateway health status.
   */
  async health(): Promise<GatewayHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.authToken
          ? { Authorization: `Bearer ${this.authToken}` }
          : {},
      });
      return (await res.json()) as GatewayHealth;
    } catch (err) {
      return { status: 'error' };
    }
  }

  /**
   * Apply a full config replacement via RPC.
   * Note: Rate-limited to 3 requests per 60 seconds.
   */
  async configApply(config: OpenClawConfig): Promise<void> {
    await this.rpc('config.apply', { raw: JSON.stringify(config) });
  }

  /**
   * Patch the config via RPC (partial update).
   * Note: Rate-limited to 3 requests per 60 seconds.
   */
  async configPatch(patch: Partial<OpenClawConfig>): Promise<void> {
    await this.rpc('config.patch', { patch });
  }

  /**
   * Invoke a tool via the Gateway API.
   * This is how Antfarm manages cron jobs when the HTTP API is available.
   */
  async toolInvoke(
    tool: string,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.rpc('tools.invoke', { tool, action, ...params });
  }

  /**
   * List active sessions.
   */
  async sessionsList(): Promise<unknown[]> {
    return this.rpc<unknown[]>('sessions.list');
  }

  /**
   * Kill a session.
   */
  async sessionsKill(sessionId: string): Promise<void> {
    await this.rpc('sessions.kill', { id: sessionId });
  }
}

/**
 * Custom error for Gateway API failures.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
