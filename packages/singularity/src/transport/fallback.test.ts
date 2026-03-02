import { describe, it, expect } from "vitest";
import { isConnectionError, withFallback } from "./fallback.js";
import { GatewayError } from "../errors.js";

describe("isConnectionError", () => {
  it("returns true for connection refused", () => {
    expect(isConnectionError(new Error("connection refused"))).toBe(true);
  });

  it("returns true for ECONNREFUSED", () => {
    expect(isConnectionError(new Error("ECONNREFUSED"))).toBe(true);
  });

  it("returns true for fetch failed", () => {
    expect(isConnectionError(new Error("fetch failed"))).toBe(true);
  });

  it("returns true when cause is a connection error", () => {
    const cause = new Error("connection refused");
    const err = new Error("wrapper", { cause });
    expect(isConnectionError(err)).toBe(true);
  });

  it("returns false for non-connection errors", () => {
    expect(isConnectionError(new Error("some other error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isConnectionError("string")).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe("withFallback", () => {
  it("returns httpFn result on success", async () => {
    const result = await withFallback(
      async () => "http-ok",
      async () => "cli-ok",
    );
    expect(result).toBe("http-ok");
  });

  it("falls back to cliFn on connection error", async () => {
    const result = await withFallback(
      async () => { throw new Error("connection refused"); },
      async () => "cli-fallback",
    );
    expect(result).toBe("cli-fallback");
  });

  it("falls back on GatewayError with Tool not available", async () => {
    const result = await withFallback(
      async () => { throw new GatewayError(400, "Tool not available: cron"); },
      async () => "cli-fallback",
    );
    expect(result).toBe("cli-fallback");
  });

  it("re-throws non-connection errors", async () => {
    await expect(withFallback(
      async () => { throw new Error("bad request"); },
      async () => "cli",
    )).rejects.toThrow("bad request");
  });
});
