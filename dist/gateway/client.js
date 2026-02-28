/**
 * HTTP client for the OpenClaw Gateway API.
 *
 * The Gateway runs at http://127.0.0.1:18789 by default and exposes
 * RPC endpoints for configuration, health, and tool invocation.
 */
export class GatewayClient {
    baseUrl;
    authToken;
    constructor(baseUrl, authToken) {
        this.baseUrl = (baseUrl || 'http://127.0.0.1:18789').replace(/\/$/, '');
        this.authToken = authToken;
    }
    /**
     * Make an RPC call to the Gateway.
     */
    async rpc(method, params) {
        const headers = {
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
            throw new GatewayError(`Gateway RPC "${method}" failed: ${res.status} ${res.statusText}`, res.status, text);
        }
        const data = (await res.json());
        if (data.error) {
            throw new GatewayError(`Gateway RPC "${method}" error: ${data.error.message}`, data.error.code);
        }
        return data.result;
    }
    /**
     * Check if the Gateway is reachable.
     */
    async isReachable() {
        try {
            await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get Gateway health status.
     */
    async health() {
        try {
            const res = await fetch(`${this.baseUrl}/health`, {
                headers: this.authToken
                    ? { Authorization: `Bearer ${this.authToken}` }
                    : {},
            });
            return (await res.json());
        }
        catch (err) {
            return { status: 'error' };
        }
    }
    /**
     * Apply a full config replacement via RPC.
     * Note: Rate-limited to 3 requests per 60 seconds.
     */
    async configApply(config) {
        await this.rpc('config.apply', { raw: JSON.stringify(config) });
    }
    /**
     * Patch the config via RPC (partial update).
     * Note: Rate-limited to 3 requests per 60 seconds.
     */
    async configPatch(patch) {
        await this.rpc('config.patch', { patch });
    }
    /**
     * Invoke a tool via the Gateway API.
     * This is how Antfarm manages cron jobs when the HTTP API is available.
     */
    async toolInvoke(tool, action, params) {
        return this.rpc('tools.invoke', { tool, action, ...params });
    }
    /**
     * List active sessions.
     */
    async sessionsList() {
        return this.rpc('sessions.list');
    }
    /**
     * Kill a session.
     */
    async sessionsKill(sessionId) {
        await this.rpc('sessions.kill', { id: sessionId });
    }
}
/**
 * Custom error for Gateway API failures.
 */
export class GatewayError extends Error {
    statusCode;
    responseBody;
    constructor(message, statusCode, responseBody) {
        super(message);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
        this.name = 'GatewayError';
    }
}
//# sourceMappingURL=client.js.map