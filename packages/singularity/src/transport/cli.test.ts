import { describe, it, expect, vi } from "vitest";
import { SDKError } from "../errors.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { CliTransport } from "./cli.js";
import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

function simulateExecFile(stdout: string, err?: Error) {
  mockExecFile.mockImplementation((_binary: any, _args: any, _opts: any, cb?: any) => {
    // promisify wraps (err, stdout, stderr) → the mock must call the callback
    const callback = typeof _opts === "function" ? _opts : cb;
    if (err) {
      callback(err, "", "");
    } else {
      callback(null, stdout, "");
    }
    return undefined as any;
  });
}

describe("CliTransport", () => {
  describe("run", () => {
    it("returns trimmed stdout on success", async () => {
      simulateExecFile("  hello world  \n");
      const cli = new CliTransport("openclaw");
      const result = await cli.run(["status"]);
      expect(result).toBe("hello world");
    });

    it("throws SDKError on command failure", async () => {
      simulateExecFile("", new Error("command not found"));
      const cli = new CliTransport("openclaw");
      await expect(cli.run(["bad"])).rejects.toThrow(SDKError);
    });
  });

  describe("runJSON", () => {
    it("parses stdout as JSON", async () => {
      simulateExecFile('{"jobs":[]}');
      const cli = new CliTransport("openclaw");
      const result = await cli.runJSON(["cron", "list", "--json"]);
      expect(result).toEqual({ jobs: [] });
    });

    it("throws on invalid JSON output", async () => {
      simulateExecFile("not json");
      const cli = new CliTransport("openclaw");
      await expect(cli.runJSON(["foo"])).rejects.toThrow();
    });
  });
});
