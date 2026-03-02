import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentsModule } from "./agents.js";
import { NotFoundError } from "../errors.js";
import type { ResolvedSDKConfig } from "../types.js";
import type { HttpTransport } from "../transport/http.js";
import type { CliTransport } from "../transport/cli.js";

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "singularity-agents-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeModule(configPath: string): AgentsModule {
  const config: ResolvedSDKConfig = {
    gatewayUrl: "http://localhost:3000",
    cliBinary: "openclaw",
    dbPath: "/tmp/test.db",
    configPath,
    cronStorePath: "/tmp/cron.json",
    skillsDir: "/tmp/skills",
    agentsBaseDir: "/tmp/agents",
    workflowsDir: "/tmp/workflows",
  };
  return new AgentsModule({} as HttpTransport, {} as CliTransport, config);
}

describe("AgentsModule", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("list returns empty array when no config file", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const mod = makeModule(join(tmp.dir, "config.json"));
    const agents = await mod.list();
    expect(agents).toEqual([]);
  });

  it("list returns agents from flat array format", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ id: "agent1", name: "Agent One", model: "opus" }],
    }));
    const mod = makeModule(configPath);
    const agents = await mod.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("agent1");
    expect(agents[0].name).toBe("Agent One");
  });

  it("list returns agents from nested format", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: { list: [{ id: "nested1" }] },
    }));
    const mod = makeModule(configPath);
    const agents = await mod.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("nested1");
  });

  it("get returns specific agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ id: "a1" }, { id: "a2" }],
    }));
    const mod = makeModule(configPath);
    const agent = await mod.get("a2");
    expect(agent.id).toBe("a2");
  });

  it("get throws NotFoundError for missing agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ agents: [] }));
    const mod = makeModule(configPath);
    await expect(mod.get("nope")).rejects.toThrow(NotFoundError);
  });

  it("create adds a new agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ agents: [] }));
    const mod = makeModule(configPath);
    const agent = await mod.create({ id: "new1", name: "New", model: "sonnet" });
    expect(agent.id).toBe("new1");
    expect(agent.name).toBe("New");

    const list = await mod.list();
    expect(list).toHaveLength(1);
  });

  it("create upserts existing agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ id: "dup", name: "Old" }],
    }));
    const mod = makeModule(configPath);
    await mod.create({ id: "dup", name: "Updated" });

    const list = await mod.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Updated");
  });

  it("update modifies agent fields", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ id: "upd1", name: "Before" }],
    }));
    const mod = makeModule(configPath);
    const updated = await mod.update("upd1", { name: "After", model: "haiku" });
    expect(updated.name).toBe("After");
    expect(updated.model).toBe("haiku");
  });

  it("update throws NotFoundError for missing agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ agents: [] }));
    const mod = makeModule(configPath);
    await expect(mod.update("missing", { name: "x" })).rejects.toThrow(NotFoundError);
  });

  it("delete removes agent from config", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      agents: [{ id: "del1" }],
    }));
    const mod = makeModule(configPath);
    await mod.delete("del1");
    const list = await mod.list();
    expect(list).toHaveLength(0);
  });

  it("delete throws NotFoundError for missing agent", async () => {
    const tmp = makeTmpDir();
    cleanup = tmp.cleanup;
    const configPath = join(tmp.dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ agents: [] }));
    const mod = makeModule(configPath);
    await expect(mod.delete("nope")).rejects.toThrow(NotFoundError);
  });
});
