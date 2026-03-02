import { createSingularitySDK } from "@wezdev/singularity";
import type { CronSchedule, CronPayload, CronJob } from "@wezdev/singularity";

const sdk = createSingularitySDK();

export async function createAgent(
    agentId: string,
    workspace: string,
    role: string,
    description?: string,
    model?: string,
): Promise<void> {
    try {
        await sdk.agents.create({
            id: agentId,
            workspace,
            role,
            description,
            model,
        });
    } catch (err) {
        // Agent may already exist
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("already exists")) throw err;
    }
}

export async function removeAgent(agentId: string): Promise<void> {
    try {
        await sdk.agents.delete(agentId);
    } catch {
        // Agent may not exist
    }
}

export async function createCronJob(
    name: string,
    schedule: string,
    agentId: string,
    message: string,
    model?: string,
): Promise<void> {
    const cronSchedule: CronSchedule = {
        kind: "cron",
        cron: schedule,
    };
    const payload: CronPayload = {
        kind: "agentTurn",
        message,
        ...(model && { model }),
    };

    try {
        await sdk.cron.create({
            name,
            schedule: cronSchedule,
            payload,
            agentId,
            delivery: { mode: "none" },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("already exists")) throw err;
    }
}

export async function removeCronJob(name: string): Promise<void> {
    try {
        const jobs = await sdk.cron.list();
        const job = jobs.find((j: CronJob) => j.name === name);
        if (job) {
            await sdk.cron.delete(job.jobId);
        }
    } catch {
        // Job may not exist
    }
}

export async function listCronJobs() {
    return sdk.cron.list();
}

export async function listAgents() {
    return sdk.agents.list();
}
