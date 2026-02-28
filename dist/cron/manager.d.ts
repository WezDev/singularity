import { GatewayClient } from '../gateway/client.js';
import type { CronJobDefinition } from '../config/schema.js';
/**
 * Manages OpenClaw cron jobs.
 *
 * Uses the Gateway HTTP API when available, falls back to the `openclaw` CLI.
 * This mirrors Antfarm's approach for maximum compatibility.
 */
export declare class CronManager {
    private gateway;
    constructor(gateway: GatewayClient);
    /**
     * List all cron jobs.
     */
    list(): Promise<CronJobDefinition[]>;
    /**
     * Create a new cron job.
     */
    create(job: CronJobDefinition): Promise<void>;
    /**
     * Delete a cron job by name.
     */
    delete(name: string): Promise<void>;
    /**
     * Pause a cron job.
     */
    pause(name: string): Promise<void>;
    /**
     * Resume a paused cron job.
     */
    resume(name: string): Promise<void>;
    /**
     * Fallback: execute openclaw CLI command.
     */
    private execCli;
}
//# sourceMappingURL=manager.d.ts.map