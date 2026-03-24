import { assertEquals } from "@std/assert";
import {
  buildDiffLineMap,
  extractChangedFiles,
  findSnippetLine,
  stripBinaryDiffs,
} from "../../src/git/diff.ts";

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 const z = 3;
diff --git a/src/bar.ts b/src/bar.ts
index 1111111..2222222 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -5,6 +5,7 @@
 function hello() {
+  console.log("hello");
 }`;

const BINARY_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
diff --git a/src/bar.ts b/src/bar.ts
index 1111111..2222222 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -5,6 +5,7 @@
 function hello() {
+  console.log("hello");
 }`;

Deno.test("stripBinaryDiffs - removes binary file diffs", () => {
  const result = stripBinaryDiffs(BINARY_DIFF);
  assertEquals(result.includes("image.png"), false);
  assertEquals(result.includes("const y = 2"), true);
  assertEquals(result.includes("console.log"), true);
});

Deno.test("stripBinaryDiffs - preserves non-binary diffs", () => {
  const result = stripBinaryDiffs(SAMPLE_DIFF);
  assertEquals(result, SAMPLE_DIFF);
});

Deno.test("stripBinaryDiffs - handles empty diff", () => {
  assertEquals(stripBinaryDiffs(""), "");
});

Deno.test("extractChangedFiles - extracts file paths from diff", () => {
  const files = extractChangedFiles(SAMPLE_DIFF);
  assertEquals(files.includes("src/foo.ts"), true);
  assertEquals(files.includes("src/bar.ts"), true);
  assertEquals(files.length, 2);
});

Deno.test("extractChangedFiles - handles empty diff", () => {
  assertEquals(extractChangedFiles(""), []);
});

Deno.test("extractChangedFiles - deduplicates files", () => {
  // +++ and --- both reference the same file
  const files = extractChangedFiles(SAMPLE_DIFF);
  const unique = new Set(files);
  assertEquals(files.length, unique.size);
});

Deno.test("stripBinaryDiffs - handles GIT binary patch", () => {
  const diff = `diff --git a/font.woff b/font.woff
index abc..def 100644
GIT binary patch
literal 1234
zcmblahblah
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
+import { foo } from "./foo";`;

  const result = stripBinaryDiffs(diff);
  assertEquals(result.includes("font.woff"), false);
  assertEquals(result.includes("import { foo }"), true);
});

Deno.test("buildDiffLineMap - maps added lines to correct line numbers", () => {
  const map = buildDiffLineMap(SAMPLE_DIFF);
  assertEquals(map.has("src/foo.ts"), true);
  // "const y = 2;" is added at new-file line 2 (hunk starts at +1, context line 1, then added line 2)
  assertEquals(map.get("src/foo.ts")!.includes(2), true);
  assertEquals(map.has("src/bar.ts"), true);
  // "console.log" is added at new-file line 6 (hunk starts at +5, context line 5, then added line 6)
  assertEquals(map.get("src/bar.ts")!.includes(6), true);
});

Deno.test("findSnippetLine - finds snippet in diff", () => {
  const line = findSnippetLine(SAMPLE_DIFF, "src/foo.ts", "const y = 2");
  assertEquals(line, 2);
});

Deno.test("findSnippetLine - finds snippet in second file", () => {
  const line = findSnippetLine(SAMPLE_DIFF, "src/bar.ts", "console.log");
  assertEquals(line, 6);
});

Deno.test("findSnippetLine - returns null for non-matching snippet", () => {
  const line = findSnippetLine(SAMPLE_DIFF, "src/foo.ts", "nonexistent");
  assertEquals(line, null);
});

Deno.test("findSnippetLine - returns null for empty snippet", () => {
  const line = findSnippetLine(SAMPLE_DIFF, "src/foo.ts", "");
  assertEquals(line, null);
});

Deno.test("findSnippetLine - matches multi-line snippet via any line", () => {
  // Snippet where the key part (console.log) is on line 2
  const multiLine = 'function hello() {\n  console.log("hello");\n}';
  const line = findSnippetLine(SAMPLE_DIFF, "src/bar.ts", multiLine);
  assertEquals(line, 6);
});
