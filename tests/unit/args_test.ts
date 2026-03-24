import { assertEquals } from "@std/assert";
import { cli } from "../../src/commands.ts";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_WORKERS,
  DEFAULT_MODEL,
} from "../../src/config.ts";

Deno.test("parse - empty args defaults to check command", () => {
  const result = cli.parse([]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.command, "check");
    assertEquals(result.args.agentic, false);
    assertEquals(result.args.model, DEFAULT_MODEL);
    assertEquals(result.args.baseCommit, null);
    assertEquals(result.args.staged, false);
    assertEquals(
      result.args.confidenceThreshold,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    assertEquals(result.args.maxWorkers, DEFAULT_MAX_WORKERS);
    assertEquals(result.args.outputFormat, "text");
    assertEquals(result.args.quiet, false);
    assertEquals(result.args.verbose, false);
  }
});

Deno.test("parse - explicit check command", () => {
  const result = cli.parse(["check"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.command, "check");
  }
});

Deno.test("parse - list command", () => {
  const result = cli.parse(["list"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.command, "list");
    assertEquals(result.args.all, false);
  }
});

Deno.test("parse - list --all", () => {
  const result = cli.parse(["list", "--all"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.all, true);
  }
});

Deno.test("parse - unknown command", () => {
  const result = cli.parse(["unknown"]);
  assertEquals(result.type, "error");
});

Deno.test("parse - --agentic flag", () => {
  const result = cli.parse(["--agentic"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.agentic, true);
  }
});

Deno.test("parse - --model flag", () => {
  const result = cli.parse(["--model", "claude-opus-4-0-20250514"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.model, "claude-opus-4-0-20250514");
  }
});

Deno.test("parse - --staged and --base-commit are mutually exclusive", () => {
  const result = cli.parse(["--staged", "--base-commit", "abc123"]);
  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.message.includes("mutually exclusive"), true);
  }
});

Deno.test("parse - --confidence-threshold", () => {
  const result = cli.parse(["--confidence-threshold", "0.8"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.confidenceThreshold, 0.8);
  }
});

Deno.test("parse - --confidence-threshold invalid", () => {
  const result = cli.parse(["--confidence-threshold", "1.5"]);
  assertEquals(result.type, "error");
});

Deno.test("parse - --max-workers", () => {
  const result = cli.parse(["--max-workers", "10"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.maxWorkers, 10);
  }
});

Deno.test("parse - --output-format json", () => {
  const result = cli.parse(["--output-format", "json"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.outputFormat, "json");
  }
});

Deno.test("parse - --output-format invalid", () => {
  const result = cli.parse(["--output-format", "xml"]);
  assertEquals(result.type, "error");
});

Deno.test("parse - --quiet and --verbose", () => {
  const result = cli.parse(["--quiet", "--verbose"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.quiet, true);
    assertEquals(result.args.verbose, true);
  }
});

Deno.test("parse - --model missing value parses as empty string", () => {
  const result = cli.parse(["--model"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.model, "");
  }
});

Deno.test("parse - --repo flag", () => {
  const result = cli.parse(["--repo", "/some/path"]);
  assertEquals(result.type, "command");
  if (result.type === "command") {
    assertEquals(result.args.repo, "/some/path");
  }
});

Deno.test("parse - --help shows top-level help", () => {
  const result = cli.parse(["--help"]);
  assertEquals(result.type, "help");
  if (result.type === "help") {
    assertEquals(result.command, null);
  }
});

Deno.test("parse - check --help shows check help", () => {
  const result = cli.parse(["check", "--help"]);
  assertEquals(result.type, "help");
  if (result.type === "help") {
    assertEquals(result.command, "check");
  }
});

Deno.test("parse - --help with implicit check shows check help", () => {
  const result = cli.parse(["--agentic", "--help"]);
  assertEquals(result.type, "help");
  if (result.type === "help") {
    assertEquals(result.command, "check");
  }
});

Deno.test("parse - list --help shows list help", () => {
  const result = cli.parse(["list", "--help"]);
  assertEquals(result.type, "help");
  if (result.type === "help") {
    assertEquals(result.command, "list");
  }
});

Deno.test("parse - unknown flag returns error", () => {
  const result = cli.parse(["--nonexistent"]);
  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.message.includes("Unknown option"), true);
  }
});

Deno.test("helpText - main help includes all commands", () => {
  const text = cli.helpText(null);
  assertEquals(text.includes("check"), true);
  assertEquals(text.includes("list"), true);
  assertEquals(text.includes("(default)"), true);
});

Deno.test("helpText - check help includes all flags", () => {
  const text = cli.helpText("check");
  assertEquals(text.includes("--agentic"), true);
  assertEquals(text.includes("--model"), true);
  assertEquals(text.includes("--base-commit"), true);
  assertEquals(text.includes("--output-format"), true);
  assertEquals(text.includes("Exit codes:"), true);
});

Deno.test("helpText - list help includes --all", () => {
  const text = cli.helpText("list");
  assertEquals(text.includes("--all"), true);
});
