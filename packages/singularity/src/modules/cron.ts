import type { ResolvedSDKConfig, CronJob, CreateCronParams, UpdateCronParams } from "../types.js";
import type { HttpTransport } from "../transport/http.js";
import type { CliTransport } from "../transport/cli.js";
import { withFallback } from "../transport/fallback.js";
import { NotFoundError } from "../errors.js";

export class CronModule {
    constructor(
        private http: HttpTransport,
        private cli: CliTransport,
        private config: ResolvedSDKConfig,
    ) {}

    async list(): Promise<CronJob[]> {
        return withFallback(
            async () => {
                const result = await this.http.invoke("cron", "list");
                return (result as { jobs: CronJob[] }).jobs ?? result as CronJob[];
            },
            async () => this.cli.runJSON<CronJob[]>(["cron", "list", "--json"]),
        );
    }

    async get(jobId: string): Promise<CronJob> {
        const jobs = await this.list();
        const job = jobs.find(j => j.jobId === jobId || j.name === jobId);
        if (!job) throw new NotFoundError("CronJob", jobId);
        return job;
    }

    async create(params: CreateCronParams): Promise<CronJob> {
        return withFallback(
            async () => {
                const result = await this.http.invoke("cron", "add", params as unknown as Record<string, unknown>);
                return result as CronJob;
            },
            async () => {
                const args = ["cron", "add", "--name", params.name];
                if (params.schedule.cron) {
                    args.push("--cron", params.schedule.cron);
                }
                if (params.agentId) {
                    args.push("--agent", params.agentId);
                }
                if (params.payload.message) {
                    args.push("--message", params.payload.message);
                }
                if (params.delivery?.mode === "none") {
                    args.push("--no-deliver");
                }
                const output = await this.cli.run(args);
                return { jobId: output, name: params.name, enabled: true, schedule: params.schedule, payload: params.payload } as CronJob;
            },
        );
    }

    async delete(jobId: string): Promise<void> {
        await withFallback(
            async () => {
                await this.http.invoke("cron", "remove", { jobId });
            },
            async () => {
                await this.cli.run(["cron", "remove", jobId]);
            },
        );
    }

    async update(jobId: string, params: UpdateCronParams): Promise<CronJob> {
        return withFallback(
            async () => {
                const result = await this.http.invoke("cron", "update", { jobId, ...params } as unknown as Record<string, unknown>);
                return result as CronJob;
            },
            async () => {
                const args = ["cron", "edit", jobId];
                if (params.enabled === false) args.push("--disable");
                if (params.enabled === true) args.push("--enable");
                if (params.name) args.push("--name", params.name);
                await this.cli.run(args);
                return this.get(jobId);
            },
        );
    }
}
