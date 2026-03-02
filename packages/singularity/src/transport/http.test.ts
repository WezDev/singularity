import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTransport } from "./http.js";
import { SDKError, GatewayError } from "../errors.js";

describe("HttpTransport", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("sets auth header when token provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const transport = new HttpTransport("http://localhost:3000", "my-token");
      await transport.get("/health");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/health",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        }),
      );
    });
  });

  describe("invoke", () => {
    it("sends POST to /tools/invoke and returns JSON", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "ok" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const transport = new HttpTransport("http://localhost:3000");
      const result = await transport.invoke("cron", "list", { foo: 1 });

      expect(result).toEqual({ data: "ok" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/tools/invoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ tool: "cron", action: "list", payload: { foo: 1 } }),
        }),
      );
    });

    it("throws SDKError on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      const transport = new HttpTransport("http://localhost:3000");
      await expect(transport.invoke("cron", "list")).rejects.toThrow(SDKError);
    });

    it("throws GatewayError on non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "server error",
      }));

      const transport = new HttpTransport("http://localhost:3000");
      await expect(transport.invoke("cron", "list")).rejects.toThrow(GatewayError);
    });
  });

  describe("get", () => {
    it("sends GET and returns JSON", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      }));

      const transport = new HttpTransport("http://localhost:3000");
      const result = await transport.get("/health");
      expect(result).toEqual({ status: "ok" });
    });

    it("throws SDKError on fetch failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

      const transport = new HttpTransport("http://localhost:3000");
      await expect(transport.get("/health")).rejects.toThrow(SDKError);
    });

    it("throws GatewayError on non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "not found",
      }));

      const transport = new HttpTransport("http://localhost:3000");
      await expect(transport.get("/missing")).rejects.toThrow(GatewayError);
    });
  });
});
