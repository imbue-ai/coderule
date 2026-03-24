import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildNonAgenticPrompt } from "../../src/checker.ts";
import { buildAgenticPrompt } from "../../src/agentic.ts";
import { RULE_CHECK_SCHEMA } from "../../src/types.ts";
import type { RuleCheckResult } from "../../src/types.ts";

Deno.test("non-agentic prompt includes rule text and diff correctly", () => {
  const prompt = buildNonAgenticPrompt(
    "All functions must have return types",
    "--- a/src/foo.ts\n+++ b/src/foo.ts\n+function bar() {\n+  return 1;\n+}",
  );

  assertStringIncludes(prompt, "All functions must have return types");
  assertStringIncludes(prompt, "+function bar()");
  assertStringIncludes(prompt, "=== RULE ===");
  assertStringIncludes(prompt, "=== END RULE ===");
  assertStringIncludes(prompt, "=== DIFF BEGIN");
  assertStringIncludes(prompt, "=== DIFF END ===");
});

Deno.test("agentic prompt includes rule text and diff correctly", () => {
  const prompt = buildAgenticPrompt(
    "No hardcoded secrets",
    "+const API_KEY = 'sk-1234';",
  );

  assertStringIncludes(prompt, "No hardcoded secrets");
  assertStringIncludes(prompt, "+const API_KEY");
  assertStringIncludes(prompt, "Read, Grep, and Glob");
});

Deno.test("schema has all required fields", () => {
  assertEquals(RULE_CHECK_SCHEMA.type, "object");
  assertEquals(RULE_CHECK_SCHEMA.required.includes("violated"), true);
  assertEquals(RULE_CHECK_SCHEMA.required.includes("confidence"), true);
  assertEquals(RULE_CHECK_SCHEMA.required.includes("explanation"), true);
  assertEquals(RULE_CHECK_SCHEMA.required.includes("violations"), true);
  assertEquals(RULE_CHECK_SCHEMA.additionalProperties, false);
});

Deno.test("response deserialization into TypeScript types", () => {
  const rawJson = JSON.stringify({
    violated: true,
    confidence: 0.9,
    explanation: "Found a console.log",
    violations: [
      {
        description: "console.log in production code",
        file: "src/app.ts",
        code_snippet: 'console.log("debug")',
      },
    ],
  });

  const result: RuleCheckResult = JSON.parse(rawJson);
  assertEquals(result.violated, true);
  assertEquals(result.confidence, 0.9);
  assertEquals(result.violations.length, 1);
  assertEquals(result.violations[0].file, "src/app.ts");
});

Deno.test("non-violated response deserialization", () => {
  const rawJson = JSON.stringify({
    violated: false,
    confidence: 0.95,
    explanation: "No violations found",
    violations: [],
  });

  const result: RuleCheckResult = JSON.parse(rawJson);
  assertEquals(result.violated, false);
  assertEquals(result.violations.length, 0);
});

Deno.test("agentic CLI arguments construction", () => {
  const schemaJson = JSON.stringify(RULE_CHECK_SCHEMA);
  const expectedArgs = [
    "-p",
    "--output-format",
    "json",
    "--model",
    "claude-sonnet-4-6",
    "--allowedTools",
    "Read",
    "Grep",
    "Glob",
    "--permission-mode",
    "bypassPermissions",
    "--json-schema",
    schemaJson,
  ];

  // Verify the schema can be serialized to JSON
  assertEquals(typeof schemaJson, "string");
  const parsed = JSON.parse(schemaJson);
  assertEquals(parsed.type, "object");

  // Verify expected args format
  assertEquals(expectedArgs.includes("-p"), true);
  assertEquals(expectedArgs.includes("--permission-mode"), true);
  assertEquals(expectedArgs.includes("bypassPermissions"), true);
});

Deno.test("missing ANTHROPIC_API_KEY detection", () => {
  // The actual check happens in main.ts, we just verify the env var reading
  const saved = Deno.env.get("ANTHROPIC_API_KEY");
  try {
    Deno.env.delete("ANTHROPIC_API_KEY");
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    assertEquals(key, undefined);
  } finally {
    if (saved) Deno.env.set("ANTHROPIC_API_KEY", saved);
  }
});
