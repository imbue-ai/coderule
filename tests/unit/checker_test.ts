import { assertEquals } from "@std/assert";
import { buildNonAgenticPrompt } from "../../src/checker.ts";
import { buildAgenticPrompt } from "../../src/agentic.ts";

Deno.test("buildNonAgenticPrompt - inserts rule text and diff", () => {
  const prompt = buildNonAgenticPrompt("no console.log", "diff content here");
  assertEquals(prompt.includes("no console.log"), true);
  assertEquals(prompt.includes("diff content here"), true);
  assertEquals(prompt.includes("=== RULE ==="), true);
  assertEquals(prompt.includes("=== DIFF BEGIN"), true);
});

Deno.test("buildAgenticPrompt - inserts rule text and diff", () => {
  const prompt = buildAgenticPrompt("no console.log", "diff content here");
  assertEquals(prompt.includes("no console.log"), true);
  assertEquals(prompt.includes("diff content here"), true);
  assertEquals(prompt.includes("Read, Grep, and Glob"), true);
});

Deno.test("buildNonAgenticPrompt - contains key instructions", () => {
  const prompt = buildNonAgenticPrompt("test rule", "test diff");
  assertEquals(
    prompt.includes("Only report violations that were introduced by the diff"),
    true,
  );
  assertEquals(prompt.includes("perfectly fine to report no violations"), true);
});

Deno.test("buildAgenticPrompt - contains agentic-specific instructions", () => {
  const prompt = buildAgenticPrompt("test rule", "test diff");
  assertEquals(prompt.includes("Use the available tools"), true);
  assertEquals(prompt.includes("changes on the current branch"), true);
});
