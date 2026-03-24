import { assertEquals, assertNotEquals } from "@std/assert";
import {
  isRuleActive,
  matchGlob,
  parseCodeRuleLine,
  parseGrepOutput,
} from "../../src/rules.ts";

Deno.test("parseCodeRuleLine - parses basic CODERULE with no path mask", () => {
  const result = parseCodeRuleLine(
    "// CODERULE: no console.log in production code",
    "src/utils.ts",
    5,
  );
  assertEquals(result, {
    text: "no console.log in production code",
    file: "src/utils.ts",
    line: 5,
    pathMask: null,
  });
});

Deno.test("parseCodeRuleLine - parses CODERULE with path mask", () => {
  const result = parseCodeRuleLine(
    "# CODERULE[src/**/*.ts]: all exports must have types",
    "RULES.md",
    10,
  );
  assertEquals(result, {
    text: "all exports must have types",
    file: "RULES.md",
    line: 10,
    pathMask: "src/**/*.ts",
  });
});

Deno.test("parseCodeRuleLine - returns null for non-matching line", () => {
  const result = parseCodeRuleLine("// just a comment", "foo.ts", 1);
  assertEquals(result, null);
});

Deno.test("parseCodeRuleLine - handles CODERULE in string context", () => {
  const result = parseCodeRuleLine(
    'const x = "CODERULE: test rule"',
    "foo.ts",
    1,
  );
  // It still matches - we grep for it, so it's found
  assertNotEquals(result, null);
  assertEquals(result!.text, 'test rule"');
});

Deno.test("parseCodeRuleLine - handles malformed annotation (missing colon)", () => {
  const result = parseCodeRuleLine("// CODERULE no colon", "foo.ts", 1);
  assertEquals(result, null);
});

Deno.test("parseCodeRuleLine - handles unclosed brackets", () => {
  const result = parseCodeRuleLine(
    "// CODERULE[unclosed: some rule",
    "foo.ts",
    1,
  );
  // Regex won't match unclosed bracket
  assertEquals(result, null);
});

Deno.test("parseCodeRuleLine - handles multiple CODERULEs: first match", () => {
  const result = parseCodeRuleLine(
    "// CODERULE: first rule CODERULE: second rule",
    "foo.ts",
    1,
  );
  assertNotEquals(result, null);
  assertEquals(result!.text, "first rule CODERULE: second rule");
});

Deno.test("parseGrepOutput - parses multiple lines", () => {
  const output = [
    "src/foo.ts:10:// CODERULE: rule one",
    "src/bar.ts:20:# CODERULE[*.ts]: rule two",
    "",
  ].join("\n");

  const rules = parseGrepOutput(output);
  assertEquals(rules.length, 2);
  assertEquals(rules[0].text, "rule one");
  assertEquals(rules[0].file, "src/foo.ts");
  assertEquals(rules[0].line, 10);
  assertEquals(rules[0].pathMask, null);
  assertEquals(rules[1].text, "rule two");
  assertEquals(rules[1].pathMask, "*.ts");
});

Deno.test("parseGrepOutput - handles empty output", () => {
  assertEquals(parseGrepOutput(""), []);
  assertEquals(parseGrepOutput("\n"), []);
});

Deno.test("parseGrepOutput - skips non-matching lines", () => {
  const output =
    "src/foo.ts:10:// just a comment\nsrc/bar.ts:5:// CODERULE: valid rule\n";
  const rules = parseGrepOutput(output);
  assertEquals(rules.length, 1);
  assertEquals(rules[0].text, "valid rule");
});

Deno.test("isRuleActive - rule with no mask is always active", () => {
  const rule = { text: "test", file: "foo.ts", line: 1, pathMask: null };
  assertEquals(isRuleActive(rule, []), true);
  assertEquals(isRuleActive(rule, ["anything.ts"]), true);
});

Deno.test("isRuleActive - rule with mask matches changed files", () => {
  const rule = {
    text: "test",
    file: "foo.ts",
    line: 1,
    pathMask: "src/**/*.ts",
  };
  assertEquals(isRuleActive(rule, ["src/utils/helper.ts"]), true);
  assertEquals(isRuleActive(rule, ["lib/other.ts"]), false);
  assertEquals(isRuleActive(rule, ["src/index.js"]), false);
});

Deno.test("matchGlob - basic wildcard", () => {
  assertEquals(matchGlob("*.ts", "foo.ts"), true);
  assertEquals(matchGlob("*.ts", "foo.js"), false);
  assertEquals(matchGlob("*.ts", "dir/foo.ts"), false);
});

Deno.test("matchGlob - double star", () => {
  assertEquals(matchGlob("src/**/*.ts", "src/foo.ts"), true);
  assertEquals(matchGlob("src/**/*.ts", "src/deep/nested/foo.ts"), true);
  assertEquals(matchGlob("src/**/*.ts", "lib/foo.ts"), false);
});

Deno.test("matchGlob - question mark", () => {
  assertEquals(matchGlob("?.ts", "a.ts"), true);
  assertEquals(matchGlob("?.ts", "ab.ts"), false);
});

Deno.test("matchGlob - exact match", () => {
  assertEquals(matchGlob("src/index.ts", "src/index.ts"), true);
  assertEquals(matchGlob("src/index.ts", "src/other.ts"), false);
});
