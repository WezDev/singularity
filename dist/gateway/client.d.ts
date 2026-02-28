import type { OpenClawConfig } from '../config/schema.js';
export interface GatewayHealth {
    status: 'ok' | 'degraded' | 'error';
    version?: string;
    uptime?: number;
    agents?: number;
}
export interface RPCResponse<T = unknown> {
    result?: T;
    error?: {
        code: number;
        message: string;
    };
}
/**
 * HTTP client for the OpenClaw Gateway API.
 *
 * The Gateway runs at http://127.0.0.1:18789 by default and exposes
 * RPC endpoints for configuration, health, and tool invocation.
 */
export declare class GatewayClient {
    private baseUrl;
    private authToken?;
    constructor(baseUrl?: string, authToken?: string);
    /**
     * Make an RPC call to the Gateway.
     */
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Check if the Gateway is reachable.
     */
    isReachable(): Promise<boolean>;
    /**
     * Get Gateway health status.
     */
    health(): Promise<GatewayHealth>;
    /**
     * Apply a full config replacement via RPC.
     * Note: Rate-limited to 3 requests per 60 seconds.
     */
    configApply(config: OpenClawConfig): Promise<void>;
    /**
     * Patch the config via RPC (partial update).
     * Note: Rate-limited to 3 requests per 60 seconds.
     */
    configPatch(patch: Partial<OpenClawConfig>): Promise<void>;
    /**
     * Invoke a tool via the Gateway API.
     * This is how Antfarm manages cron jobs when the HTTP API is available.
     */
    toolInvoke(tool: string, action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * List active sessions.
     */
    sessionsList(): Promise<unknown[]>;
    /**
     * Kill a session.
     */
    sessionsKill(sessionId: string): Promise<void>;
}
/**
 * Custom error for Gateway API failures.
 */
export declare class GatewayError extends Error {
    statusCode?: number | undefined;
    responseBody?: string | undefined;
    constructor(message: string, statusCode?: number | undefined, responseBody?: string | undefined);
}
//# sourceMappingURL=client.d.ts.map