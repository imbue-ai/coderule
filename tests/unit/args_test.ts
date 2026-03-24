import { assertEquals } from "@std/assert";
import { parseArgs } from "../../src/args.ts";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_WORKERS,
  DEFAULT_MODEL,
} from "../../src/types.ts";

Deno.test("parseArgs - empty args defaults to check command", () => {
  const result = parseArgs([]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.agentic, false);
    assertEquals(result.options.model, DEFAULT_MODEL);
    assertEquals(result.options.baseCommit, null);
    assertEquals(result.options.staged, false);
    assertEquals(
      result.options.confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    assertEquals(result.options.maxWorkers, DEFAULT_MAX_WORKERS);
    assertEquals(result.options.outputFormat, "text");
    assertEquals(result.options.quiet, false);
    assertEquals(result.options.verbose, false);
  }
});

Deno.test("parseArgs - explicit check command", () => {
  const result = parseArgs(["check"]);
  assertEquals(result.type, "check");
});

Deno.test("parseArgs - list command", () => {
  const result = parseArgs(["list"]);
  assertEquals(result.type, "list");
  if (result.type === "list") {
    assertEquals(result.all, false);
  }
});

Deno.test("parseArgs - list --all", () => {
  const result = parseArgs(["list", "--all"]);
  assertEquals(result.type, "list");
  if (result.type === "list") {
    assertEquals(result.all, true);
  }
});

Deno.test("parseArgs - unknown command", () => {
  const result = parseArgs(["unknown"]);
  assertEquals(result.type, "error");
});

Deno.test("parseArgs - --agentic flag", () => {
  const result = parseArgs(["--agentic"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.agentic, true);
  }
});

Deno.test("parseArgs - --model flag", () => {
  const result = parseArgs(["--model", "claude-opus-4-0-20250514"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.model, "claude-opus-4-0-20250514");
  }
});

Deno.test("parseArgs - --staged and --base-commit are mutually exclusive", () => {
  const result = parseArgs(["--staged", "--base-commit", "abc123"]);
  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.message.includes("mutually exclusive"), true);
  }
});

Deno.test("parseArgs - --confidence-threshold", () => {
  const result = parseArgs(["--confidence-threshold", "0.8"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.confidenceThreshold, 0.8);
  }
});

Deno.test("parseArgs - --confidence-threshold invalid", () => {
  const result = parseArgs(["--confidence-threshold", "1.5"]);
  assertEquals(result.type, "error");
});

Deno.test("parseArgs - --max-workers", () => {
  const result = parseArgs(["--max-workers", "10"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.maxWorkers, 10);
  }
});

Deno.test("parseArgs - --output-format json", () => {
  const result = parseArgs(["--output-format", "json"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.outputFormat, "json");
  }
});

Deno.test("parseArgs - --output-format invalid", () => {
  const result = parseArgs(["--output-format", "xml"]);
  assertEquals(result.type, "error");
});

Deno.test("parseArgs - --quiet and --verbose", () => {
  const result = parseArgs(["--quiet", "--verbose"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.quiet, true);
    assertEquals(result.options.verbose, true);
  }
});

Deno.test("parseArgs - --model missing value parses as empty string", () => {
  const result = parseArgs(["--model"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.model, "");
  }
});

Deno.test("parseArgs - --repo flag", () => {
  const result = parseArgs(["--repo", "/some/path"]);
  assertEquals(result.type, "check");
  if (result.type === "check") {
    assertEquals(result.options.repo, "/some/path");
  }
});
