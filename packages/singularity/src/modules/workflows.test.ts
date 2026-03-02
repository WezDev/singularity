import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkflowsModule } from "./workflows.js";
import { NotFoundError } from "../errors.js";
import type { ResolvedSDKConfig } from "../types.js";

function makeTmpDir() {
    const dir = mkdtempSync(join(tmpdir(), "singularity-workflows-"));
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SIMPLE_WORKFLOW_YAML = `\
id: test-wf
name: Test Workflow
version: 1
description: A test workflow
agents:
  - id: coder
    name: Coder
    role: coder
    description: Writes code
runs:
  - id: main
    name: Main Run
    description: Main run
    steps:
      - id: step1
        agent: coder
        input: Do the thing
        expects: Done
`;

function makeConfig(workflowsDir: string, configPath?: string): ResolvedSDKConfig {
    return {
        gatewayUrl: "http://localhost:3000",
        cliBinary: "openclaw",
        dbPath: "/tmp/test.db",
        configPath: configPath ?? "/tmp/nonexistent-config.json",
        cronStorePath: "/tmp/cron.json",
        skillsDir: "/tmp/skills",
        agentsBaseDir: "/tmp/agents",
        workflowsDir,
    };
}

describe("WorkflowsModule", () => {
    let cleanup: () => void;

    afterEach(() => {
        cleanup?.();
    });

    it("list returns empty array when dir does not exist", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "nonexistent")));
        const result = await mod.list();
        expect(result).toEqual([]);
    });

    it("list returns workflows from yaml files", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        mkdirSync(join(tmp.dir, "wf"));
        writeFileSync(join(tmp.dir, "wf", "test-wf.yaml"), SIMPLE_WORKFLOW_YAML);
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        const result = await mod.list();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("test-wf");
        expect(result[0].name).toBe("Test Workflow");
    });

    it("list returns multiple workflows", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        mkdirSync(join(tmp.dir, "wf"));
        writeFileSync(join(tmp.dir, "wf", "wf1.yaml"), SIMPLE_WORKFLOW_YAML.replace("id: test-wf", "id: wf1").replace("name: Test Workflow", "name: WF1"));
        writeFileSync(join(tmp.dir, "wf", "wf2.yaml"), SIMPLE_WORKFLOW_YAML.replace("id: test-wf", "id: wf2").replace("name: Test Workflow", "name: WF2"));
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        const result = await mod.list();
        expect(result).toHaveLength(2);
    });

    it("get returns workflow by id", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        mkdirSync(join(tmp.dir, "wf"));
        writeFileSync(join(tmp.dir, "wf", "test-wf.yaml"), SIMPLE_WORKFLOW_YAML);
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        const wf = await mod.get("test-wf");
        expect(wf.id).toBe("test-wf");
        expect(wf.description).toBe("A test workflow");
    });

    it("get throws NotFoundError for missing workflow", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        await expect(mod.get("missing")).rejects.toThrow(NotFoundError);
    });

    it("create writes YAML and returns Workflow", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const mod = new WorkflowsModule(makeConfig(wfDir));
        const created = await mod.create({
            id: "new-wf",
            name: "New Workflow",
            description: "Freshly created",
            agents: [],
            runs: [],
        });
        expect(created.id).toBe("new-wf");
        expect(created.name).toBe("New Workflow");
    });

    it("create then get returns identical fields (YAML round-trip)", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const mod = new WorkflowsModule(makeConfig(wfDir));
        const created = await mod.create({
            id: "roundtrip",
            name: "Round Trip",
            description: "Testing round trip",
            agents: [{ id: "bot", name: "Bot", role: "coder", description: "Does stuff" }],
            runs: [],
        });
        const fetched = await mod.get("roundtrip");
        expect(fetched.id).toBe(created.id);
        expect(fetched.name).toBe(created.name);
        expect(fetched.description).toBe(created.description);
        expect(fetched.agents).toEqual(created.agents);
    });

    it("update merges fields and persists", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const mod = new WorkflowsModule(makeConfig(wfDir));
        await mod.create({
            id: "edit-wf",
            name: "Original",
            description: "Original desc",
            agents: [],
            runs: [],
        });
        const updated = await mod.update("edit-wf", { name: "Updated Name" });
        expect(updated.name).toBe("Updated Name");
        expect(updated.description).toBe("Original desc");
    });

    it("update throws NotFoundError for missing workflow", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        await expect(mod.update("missing", { name: "x" })).rejects.toThrow(NotFoundError);
    });

    it("delete removes the workflow file", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const mod = new WorkflowsModule(makeConfig(wfDir));
        await mod.create({ id: "del-wf", name: "Del", description: "Delete me", agents: [], runs: [] });
        await mod.delete("del-wf");
        await expect(mod.get("del-wf")).rejects.toThrow(NotFoundError);
    });

    it("delete throws NotFoundError for missing workflow", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const mod = new WorkflowsModule(makeConfig(join(tmp.dir, "wf")));
        await expect(mod.delete("missing")).rejects.toThrow(NotFoundError);
    });

    it("status is installed when all agents are in config", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const configPath = join(tmp.dir, "config.json");
        writeFileSync(configPath, JSON.stringify({
            agents: [{ id: "mywf_coder", name: "Coder" }],
        }));
        const mod = new WorkflowsModule(makeConfig(wfDir, configPath));
        await mod.create({
            id: "mywf",
            name: "My WF",
            description: "desc",
            agents: [{ id: "coder", name: "Coder", role: "coder", description: "Writes code" }],
            runs: [],
        });
        const wf = await mod.get("mywf");
        expect(wf.status).toBe("installed");
    });

    it("status is not_installed when agents are missing from config", async () => {
        const tmp = makeTmpDir();
        cleanup = tmp.cleanup;
        const wfDir = join(tmp.dir, "wf");
        const mod = new WorkflowsModule(makeConfig(wfDir));
        await mod.create({
            id: "mywf2",
            name: "My WF2",
            description: "desc",
            agents: [{ id: "coder", name: "Coder", role: "coder", description: "Writes code" }],
            runs: [],
        });
        const wf = await mod.get("mywf2");
        expect(wf.status).toBe("not_installed");
    });
});
