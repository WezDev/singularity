import { describe, it, expect, vi } from "vitest";
import { CronModule } from "./cron.js";
import { NotFoundError } from "../errors.js";
import { SDKError } from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { CliTransport } from "../transport/cli.js";
import type { ResolvedSDKConfig, CronJob } from "../types.js";

const SAMPLE_JOB: CronJob = {
    jobId: "job-1",
    name: "my-job",
    enabled: true,
    schedule: { cron: "0 * * * *" },
    payload: { message: "Hello" },
};

function makeConfig(): ResolvedSDKConfig {
    return {
        gatewayUrl: "http://localhost:3000",
        cliBinary: "openclaw",
        dbPath: "/tmp/test.db",
        configPath: "/tmp/config.json",
        cronStorePath: "/tmp/cron.json",
        skillsDir: "/tmp/skills",
        agentsBaseDir: "/tmp/agents",
        workflowsDir: "/tmp/workflows",
    };
}

function makeTransports() {
    const http = {
        invoke: vi.fn(),
        get: vi.fn(),
    } as unknown as HttpTransport;

    const cli = {
        run: vi.fn(),
        runJSON: vi.fn(),
    } as unknown as CliTransport;

    return { http, cli };
}

describe("CronModule", () => {
    it("list uses http transport when available", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue({ jobs: [SAMPLE_JOB] });
        const mod = new CronModule(http, cli, makeConfig());
        const result = await mod.list();
        expect(result).toHaveLength(1);
        expect(result[0].jobId).toBe("job-1");
        expect(http.invoke).toHaveBeenCalledWith("cron", "list");
        expect(cli.runJSON).not.toHaveBeenCalled();
    });

    it("list falls back to cli when http throws connection error", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockRejectedValue(new SDKError("Gateway connection failed", undefined, { cause: new Error("fetch failed") }));
        vi.mocked(cli.runJSON).mockResolvedValue([SAMPLE_JOB]);
        const mod = new CronModule(http, cli, makeConfig());
        const result = await mod.list();
        expect(result).toHaveLength(1);
        expect(cli.runJSON).toHaveBeenCalledWith(["cron", "list", "--json"]);
    });

    it("get returns job found by jobId", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue({ jobs: [SAMPLE_JOB] });
        const mod = new CronModule(http, cli, makeConfig());
        const job = await mod.get("job-1");
        expect(job.jobId).toBe("job-1");
    });

    it("get returns job found by name", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue({ jobs: [SAMPLE_JOB] });
        const mod = new CronModule(http, cli, makeConfig());
        const job = await mod.get("my-job");
        expect(job.name).toBe("my-job");
    });

    it("get throws NotFoundError for missing job", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue({ jobs: [] });
        const mod = new CronModule(http, cli, makeConfig());
        await expect(mod.get("missing")).rejects.toThrow(NotFoundError);
    });

    it("create uses http transport", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue(SAMPLE_JOB);
        const mod = new CronModule(http, cli, makeConfig());
        const result = await mod.create({
            name: "my-job",
            schedule: { cron: "0 * * * *" },
            payload: { message: "Hello" },
        });
        expect(result.jobId).toBe("job-1");
        expect(http.invoke).toHaveBeenCalledWith("cron", "add", expect.any(Object));
    });

    it("create falls back to cli when http throws connection error", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockRejectedValue(new SDKError("Gateway connection failed", undefined, { cause: new Error("fetch failed") }));
        vi.mocked(cli.run).mockResolvedValue("new-job-id");
        const mod = new CronModule(http, cli, makeConfig());
        const result = await mod.create({
            name: "cli-job",
            schedule: { cron: "0 * * * *" },
            payload: { message: "Hi" },
        });
        expect(result.name).toBe("cli-job");
        expect(cli.run).toHaveBeenCalled();
    });

    it("delete delegates to http transport", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockResolvedValue(undefined);
        const mod = new CronModule(http, cli, makeConfig());
        await mod.delete("job-1");
        expect(http.invoke).toHaveBeenCalledWith("cron", "remove", { jobId: "job-1" });
    });

    it("delete falls back to cli when http throws connection error", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke).mockRejectedValue(new SDKError("Gateway connection failed", undefined, { cause: new Error("fetch failed") }));
        vi.mocked(cli.run).mockResolvedValue("");
        const mod = new CronModule(http, cli, makeConfig());
        await mod.delete("job-1");
        expect(cli.run).toHaveBeenCalledWith(["cron", "remove", "job-1"]);
    });

    it("update uses http transport", async () => {
        const { http, cli } = makeTransports();
        const updated = { ...SAMPLE_JOB, enabled: false };
        vi.mocked(http.invoke).mockResolvedValue(updated);
        const mod = new CronModule(http, cli, makeConfig());
        const result = await mod.update("job-1", { enabled: false });
        expect(result.enabled).toBe(false);
    });

    it("update falls back to cli with enable/disable/name flags", async () => {
        const { http, cli } = makeTransports();
        vi.mocked(http.invoke)
            .mockRejectedValueOnce(new SDKError("Gateway connection failed", undefined, { cause: new Error("fetch failed") })) // update
            .mockResolvedValue({ jobs: [{ ...SAMPLE_JOB, enabled: false }] }); // list for get()
        vi.mocked(cli.run).mockResolvedValue("");
        const mod = new CronModule(http, cli, makeConfig());
        await mod.update("job-1", { enabled: false, name: "new-name" });
        expect(cli.run).toHaveBeenCalledWith(expect.arrayContaining(["--disable", "--name", "new-name"]));
    });
});
