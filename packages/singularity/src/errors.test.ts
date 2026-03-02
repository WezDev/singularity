import { describe, it, expect } from "vitest";
import { SDKError, NotFoundError, GatewayError } from "./errors.js";

describe("SDKError", () => {
  it("sets name and message", () => {
    const err = new SDKError("something failed");
    expect(err.name).toBe("SDKError");
    expect(err.message).toBe("something failed");
    expect(err).toBeInstanceOf(Error);
  });

  it("accepts context", () => {
    const err = new SDKError("fail", { tool: "test", action: "run" });
    expect(err.context).toEqual({ tool: "test", action: "run" });
  });

  it("accepts cause option", () => {
    const cause = new Error("root");
    const err = new SDKError("wrapped", undefined, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("NotFoundError", () => {
  it("formats message with resource and id", () => {
    const err = new NotFoundError("Agent", "foo");
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe("Agent not found: foo");
    expect(err.context).toEqual({ resource: "Agent", id: "foo" });
  });

  it("is an instance of SDKError", () => {
    expect(new NotFoundError("X", "y")).toBeInstanceOf(SDKError);
  });
});

describe("GatewayError", () => {
  it("formats message with status and body", () => {
    const err = new GatewayError(500, "Internal error");
    expect(err.name).toBe("GatewayError");
    expect(err.message).toBe("Gateway returned 500: Internal error");
    expect(err.context).toEqual({ status: 500 });
  });

  it("is an instance of SDKError", () => {
    expect(new GatewayError(404, "not found")).toBeInstanceOf(SDKError);
  });
});
