import { GatewayClient } from '../gateway/client.js';
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
/**
 * Manages OpenClaw sessions via the Gateway RPC API.
 *
 * Sessions represent active or recent conversations between users and agents.
 * The Gateway tracks these internally; this manager provides typed access.
 */
export declare class SessionsManager {
    private gateway;
    constructor(gateway: GatewayClient);
    /**
     * List all sessions, optionally filtered.
     */
    list(options?: SessionListOptions): Promise<Session[]>;
    /**
     * Get a specific session by ID.
     */
    get(sessionId: string): Promise<Session | null>;
    /**
     * Kill/terminate a session.
     */
    kill(sessionId: string): Promise<void>;
    /**
     * Get count of active sessions, optionally per agent.
     */
    countActive(agentId?: string): Promise<number>;
    /**
     * Normalize a raw session object from the Gateway into our typed Session.
     * The Gateway may return slightly different shapes depending on version.
     */
    private normalizeSession;
}
//# sourceMappingURL=manager.d.ts.map