import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigModule } from "./config.js";
import type { ResolvedSDKConfig } from "../types.js";

function makeTmpConfig(): { configPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "singularity-test-"));
  const configPath = join(dir, "config.json");
  return {
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function makeConfig(configPath: string): ResolvedSDKConfig {
  return {
    gatewayUrl: "http://localhost:3000",
    cliBinary: "openclaw",
    dbPath: "/tmp/test.db",
    configPath,
    cronStorePath: "/tmp/cron.json",
    skillsDir: "/tmp/skills",
    agentsBaseDir: "/tmp/agents",
    workflowsDir: "/tmp/workflows",
  };
}

describe("ConfigModule", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty config when file does not exist", async () => {
    const tmp = makeTmpConfig();
    cleanup = tmp.cleanup;
    const mod = new ConfigModule(makeConfig(tmp.configPath));
    const config = await mod.get();
    expect(config).toEqual({});
  });

  it("reads existing config file", async () => {
    const tmp = makeTmpConfig();
    cleanup = tmp.cleanup;
    writeFileSync(tmp.configPath, JSON.stringify({ agent: { model: "opus" } }));
    const mod = new ConfigModule(makeConfig(tmp.configPath));
    const config = await mod.get();
    expect(config.agent?.model).toBe("opus");
  });

  it("getKey returns specific key", async () => {
    const tmp = makeTmpConfig();
    cleanup = tmp.cleanup;
    writeFileSync(tmp.configPath, JSON.stringify({ agent: { model: "haiku" } }));
    const mod = new ConfigModule(makeConfig(tmp.configPath));
    const agent = await mod.getKey("agent");
    expect(agent?.model).toBe("haiku");
  });

  it("update merges config and writes back", async () => {
    const tmp = makeTmpConfig();
    cleanup = tmp.cleanup;
    writeFileSync(tmp.configPath, JSON.stringify({ agent: { model: "opus" }, cron: { enabled: true } }));
    const mod = new ConfigModule(makeConfig(tmp.configPath));

    const updated = await mod.update({ agent: { model: "sonnet" } });
    expect(updated.agent?.model).toBe("sonnet");
    expect((updated as any).cron?.enabled).toBe(true);

    // Verify persistence
    const reRead = await mod.get();
    expect(reRead.agent?.model).toBe("sonnet");
  });

  it("update does deep merge on nested objects", async () => {
    const tmp = makeTmpConfig();
    cleanup = tmp.cleanup;
    writeFileSync(tmp.configPath, JSON.stringify({ agent: { model: "opus", extra: "keep" } }));
    const mod = new ConfigModule(makeConfig(tmp.configPath));
    const updated = await mod.update({ agent: { model: "haiku" } });
    expect(updated.agent?.model).toBe("haiku");
    expect((updated.agent as any)?.extra).toBe("keep");
  });

  it("update creates parent directories if needed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "singularity-test-"));
    cleanup = () => rmSync(dir, { recursive: true, force: true });
    const configPath = join(dir, "nested", "deep", "config.json");
    const mod = new ConfigModule(makeConfig(configPath));
    const result = await mod.update({ agent: { model: "opus" } });
    expect(result.agent?.model).toBe("opus");
  });
});
