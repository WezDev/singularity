import { describe, it, expect } from "vitest";
import { snakeToCamel, parseJsonColumn, parseStepOutput, resolvePath } from "./utils.js";
import { homedir } from "node:os";
import { resolve } from "node:path";

describe("snakeToCamel", () => {
  it("converts snake_case keys to camelCase", () => {
    const result = snakeToCamel<{ fooBar: number; bazQux: string }>({
      foo_bar: 1,
      baz_qux: "hello",
    });
    expect(result).toEqual({ fooBar: 1, bazQux: "hello" });
  });

  it("leaves already camelCase keys unchanged", () => {
    const result = snakeToCamel<{ name: string }>({ name: "test" });
    expect(result).toEqual({ name: "test" });
  });

  it("handles empty object", () => {
    expect(snakeToCamel({})).toEqual({});
  });

  it("handles multiple underscores", () => {
    const result = snakeToCamel<{ fooBarBaz: number }>({ foo_bar_baz: 42 });
    expect(result).toEqual({ fooBarBaz: 42 });
  });
});

describe("parseJsonColumn", () => {
  it("parses valid JSON", () => {
    expect(parseJsonColumn('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for null input", () => {
    expect(parseJsonColumn(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJsonColumn("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseJsonColumn("not json")).toBeNull();
  });

  it("parses JSON arrays", () => {
    expect(parseJsonColumn<string[]>('["a","b"]')).toEqual(["a", "b"]);
  });
});

describe("parseStepOutput", () => {
  it("parses KEY: value format", () => {
    const result = parseStepOutput("STATUS: success\nRESULT: data here");
    expect(result).toEqual({ status: "success", result: "data here" });
  });

  it("returns empty object for null", () => {
    expect(parseStepOutput(null)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseStepOutput("")).toEqual({});
  });

  it("handles multiline values", () => {
    const result = parseStepOutput("SUMMARY: line1\nline2\nline3\nSTATUS: done");
    expect(result.summary).toBe("line1\nline2\nline3");
    expect(result.status).toBe("done");
  });

  it("lowercases keys", () => {
    const result = parseStepOutput("MY_KEY: value");
    expect(result).toHaveProperty("my_key", "value");
  });
});

describe("resolvePath", () => {
  it("expands tilde to home directory", () => {
    const result = resolvePath("~/foo/bar");
    expect(result).toBe(resolve(homedir(), "foo/bar"));
  });

  it("resolves relative paths", () => {
    const result = resolvePath("foo/bar");
    expect(result).toBe(resolve("foo/bar"));
  });

  it("keeps absolute paths", () => {
    const result = resolvePath("/absolute/path");
    expect(result).toBe("/absolute/path");
  });
});
