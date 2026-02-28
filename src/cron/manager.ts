import { readFile, writeFile, mkdir } from 'fs/promises';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { GatewayClient } from '../gateway/client.js';
import { paths } from '../filesystem/paths.js';
import type { CronJobDefinition } from '../config/schema.js';

const exec = promisify(execCb);

/**
 * Manages OpenClaw cron jobs.
 *
 * Uses the Gateway HTTP API when available, falls back to the `openclaw` CLI.
 * This mirrors Antfarm's approach for maximum compatibility.
 */
export class CronManager {
  private gateway: GatewayClient;

  constructor(gateway: GatewayClient) {
    this.gateway = gateway;
  }

  /**
   * List all cron jobs.
   */
  async list(): Promise<CronJobDefinition[]> {
    // Try Gateway API first
    try {
      const result = await this.gateway.toolInvoke('cron', 'list');
      return (result as CronJobDefinition[]) || [];
    } catch {
      // Fallback: read from jobs.json
      try {
        const raw = await readFile(paths.cronJobs, 'utf-8');
        return JSON.parse(raw) as CronJobDefinition[];
      } catch {
        return [];
      }
    }
  }

  /**
   * Create a new cron job.
   */
  async create(job: CronJobDefinition): Promise<void> {
    // Try Gateway API
    try {
      await this.gateway.toolInvoke('cron', 'create', { ...job });
      return;
    } catch {
      // Fallback to CLI
      await this.execCli('create', job);
    }
  }

  /**
   * Delete a cron job by name.
   */
  async delete(name: string): Promise<void> {
    try {
      await this.gateway.toolInvoke('cron', 'delete', { name });
      return;
    } catch {
      await this.execCli('delete', { name });
    }
  }

  /**
   * Pause a cron job.
   */
  async pause(name: string): Promise<void> {
    try {
      await this.gateway.toolInvoke('cron', 'pause', { name });
    } catch {
      await this.execCli('pause', { name });
    }
  }

  /**
   * Resume a paused cron job.
   */
  async resume(name: string): Promise<void> {
    try {
      await this.gateway.toolInvoke('cron', 'resume', { name });
    } catch {
      await this.execCli('resume', { name });
    }
  }

  /**
   * Fallback: execute openclaw CLI command.
   */
  private async execCli(
    action: string,
    params: Record<string, unknown> | CronJobDefinition,
  ): Promise<string> {
    const args = Object.entries(params)
      .map(([k, v]) => {
        if (typeof v === 'object') return `--${k} '${JSON.stringify(v)}'`;
        return `--${k} "${String(v)}"`;
      })
      .join(' ');

    const cmd = `openclaw cron ${action} ${args}`;
    const { stdout, stderr } = await exec(cmd);

    if (stderr && !stderr.includes('warning')) {
      throw new Error(`openclaw cron ${action} failed: ${stderr}`);
    }

    return stdout.trim();
  }
}
