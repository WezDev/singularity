import { GatewayClient } from '../gateway/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  agentId: string;
  /** Channel the session originated from (e.g., 'telegram', 'discord', 'web') */
  channel?: string;
  /** Peer/conversation identifier */
  peerId?: string;
  /** ISO timestamp of session start */
  startedAt: string;
  /** ISO timestamp of last activity */
  lastActiveAt?: string;
  /** Number of messages in this session */
  messageCount?: number;
  /** Tokens consumed in this session */
  tokensUsed?: number;
  /** Whether the session is currently active */
  active: boolean;
}

export interface SessionListOptions {
  /** Filter by agent ID */
  agentId?: string;
  /** Only return active sessions */
  activeOnly?: boolean;
}

// ─── Sessions Manager ─────────────────────────────────────────────────────────

/**
 * Manages OpenClaw sessions via the Gateway RPC API.
 *
 * Sessions represent active or recent conversations between users and agents.
 * The Gateway tracks these internally; this manager provides typed access.
 */
export class SessionsManager {
  private gateway: GatewayClient;

  constructor(gateway: GatewayClient) {
    this.gateway = gateway;
  }

  /**
   * List all sessions, optionally filtered.
   */
  async list(options: SessionListOptions = {}): Promise<Session[]> {
    try {
      const raw = await this.gateway.rpc<unknown[]>('sessions.list');
      let sessions = (raw || []).map(this.normalizeSession);

      if (options.agentId) {
        sessions = sessions.filter(s => s.agentId === options.agentId);
      }

      if (options.activeOnly) {
        sessions = sessions.filter(s => s.active);
      }

      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Get a specific session by ID.
   */
  async get(sessionId: string): Promise<Session | null> {
    try {
      const sessions = await this.list();
      return sessions.find(s => s.id === sessionId) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Kill/terminate a session.
   */
  async kill(sessionId: string): Promise<void> {
    await this.gateway.rpc('sessions.kill', { id: sessionId });
  }

  /**
   * Get count of active sessions, optionally per agent.
   */
  async countActive(agentId?: string): Promise<number> {
    const sessions = await this.list({ agentId, activeOnly: true });
    return sessions.length;
  }

  /**
   * Normalize a raw session object from the Gateway into our typed Session.
   * The Gateway may return slightly different shapes depending on version.
   */
  private normalizeSession(raw: unknown): Session {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id || r.sessionId || ''),
      agentId: String(r.agentId || r.agent || ''),
      channel: r.channel as string | undefined,
      peerId: r.peerId as string | undefined,
      startedAt: String(r.startedAt || r.createdAt || new Date().toISOString()),
      lastActiveAt: r.lastActiveAt as string | undefined,
      messageCount: typeof r.messageCount === 'number' ? r.messageCount : undefined,
      tokensUsed: typeof r.tokensUsed === 'number' ? r.tokensUsed : undefined,
      active: r.active !== false,
    };
  }
}
