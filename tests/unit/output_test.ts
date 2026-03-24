import { assertEquals } from "@std/assert";
import { formatGitHub, formatJson, formatText } from "../../src/output.ts";
import type { ReportedIssue } from "../../src/types.ts";

const SAMPLE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,5 @@
 const x = 1;
+console.log("debug")
+const y = 2;
 const z = 3;`;

const SAMPLE_ISSUE: ReportedIssue = {
  rule: {
    text: "no console.log",
    file: "src/rules.md",
    line: 5,
    pathMask: null,
  },
  result: {
    violated: true,
    confidence: 0.95,
    explanation: "A console.log was added",
    violations: [
      {
        description: "console.log added in helper function",
        file: "src/utils.ts",
        code_snippet: 'console.log("debug")',
      },
    ],
  },
};

Deno.test("formatText - no violations", () => {
  const result = formatText([]);
  assertEquals(result, "No violations found.");
});

Deno.test("formatText - includes rule location and violation details", () => {
  const result = formatText([SAMPLE_ISSUE]);
  assertEquals(result.includes("VIOLATION: src/rules.md:5"), true);
  assertEquals(result.includes("Rule: no console.log"), true);
  assertEquals(result.includes("95%"), true);
  assertEquals(result.includes("console.log added in helper function"), true);
  assertEquals(result.includes("File: src/utils.ts"), true);
});

Deno.test("formatJson - produces valid JSON with issues array", () => {
  const result = formatJson([SAMPLE_ISSUE]);
  const parsed = JSON.parse(result);
  assertEquals(parsed.issues.length, 1);
  assertEquals(parsed.issues[0].rule.text, "no console.log");
  assertEquals(parsed.issues[0].violated, true);
  assertEquals(parsed.issues[0].violations.length, 1);
});

Deno.test("formatJson - empty issues", () => {
  const result = formatJson([]);
  const parsed = JSON.parse(result);
  assertEquals(parsed.issues.length, 0);
});

Deno.test("formatGitHub - produces PR review payload with correct line", () => {
  const result = formatGitHub([SAMPLE_ISSUE], SAMPLE_DIFF);
  const parsed = JSON.parse(result);
  assertEquals(parsed.event, "COMMENT");
  assertEquals(typeof parsed.body, "string");
  assertEquals(parsed.body.includes("1 violation"), true);
  assertEquals(parsed.comments.length, 1);
  assertEquals(parsed.comments[0].path, "src/utils.ts");
  assertEquals(parsed.comments[0].side, "RIGHT");
  // Line should be 2 because console.log("debug") is at new-file line 2
  assertEquals(parsed.comments[0].line, 2);
});

Deno.test("formatGitHub - violation without file goes into body", () => {
  const issue: ReportedIssue = {
    rule: {
      text: "general rule",
      file: "RULES.md",
      line: 1,
      pathMask: null,
    },
    result: {
      violated: true,
      confidence: 0.9,
      explanation: "General violation",
      violations: [
        {
          description: "Something bad",
          file: "",
          code_snippet: "",
        },
      ],
    },
  };
  const result = formatGitHub([issue], "");
  const parsed = JSON.parse(result);
  assertEquals(parsed.comments.length, 0);
  assertEquals(parsed.body.includes("Something bad"), true);
});
