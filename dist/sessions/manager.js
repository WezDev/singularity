// ─── Sessions Manager ─────────────────────────────────────────────────────────
/**
 * Manages OpenClaw sessions via the Gateway RPC API.
 *
 * Sessions represent active or recent conversations between users and agents.
 * The Gateway tracks these internally; this manager provides typed access.
 */
export class SessionsManager {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    /**
     * List all sessions, optionally filtered.
     */
    async list(options = {}) {
        try {
            const raw = await this.gateway.rpc('sessions.list');
            let sessions = (raw || []).map(this.normalizeSession);
            if (options.agentId) {
                sessions = sessions.filter(s => s.agentId === options.agentId);
            }
            if (options.activeOnly) {
                sessions = sessions.filter(s => s.active);
            }
            return sessions;
        }
        catch {
            return [];
        }
    }
    /**
     * Get a specific session by ID.
     */
    async get(sessionId) {
        try {
            const sessions = await this.list();
            return sessions.find(s => s.id === sessionId) ?? null;
        }
        catch {
            return null;
        }
    }
    /**
     * Kill/terminate a session.
     */
    async kill(sessionId) {
        await this.gateway.rpc('sessions.kill', { id: sessionId });
    }
    /**
     * Get count of active sessions, optionally per agent.
     */
    async countActive(agentId) {
        const sessions = await this.list({ agentId, activeOnly: true });
        return sessions.length;
    }
    /**
     * Normalize a raw session object from the Gateway into our typed Session.
     * The Gateway may return slightly different shapes depending on version.
     */
    normalizeSession(raw) {
        const r = raw;
        return {
            id: String(r.id || r.sessionId || ''),
            agentId: String(r.agentId || r.agent || ''),
            channel: r.channel,
            peerId: r.peerId,
            startedAt: String(r.startedAt || r.createdAt || new Date().toISOString()),
            lastActiveAt: r.lastActiveAt,
            messageCount: typeof r.messageCount === 'number' ? r.messageCount : undefined,
            tokensUsed: typeof r.tokensUsed === 'number' ? r.tokensUsed : undefined,
            active: r.active !== false,
        };
    }
}
//# sourceMappingURL=manager.js.map